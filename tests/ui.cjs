'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const handlers = {};
const observable = initial => {
    let value = initial;
    function obs(...args) { if (args.length) value = args[0]; return value; }
    return obs;
};
let Popup;
let responses;
let languageChanged;
class BasePopup {
    constructor() { Popup = this.constructor; }
    addObservables(values) { for (const [key, value] of Object.entries(values)) this[key] = observable(value); }
    close() { this.onHide(); }
    static showModal() { this.__vm = new this(); this.__vm.beforeShow(); }
}
const context = {
    window: { rl: true, MutationObserver: class { constructor(callback) {languageChanged=callback;} observe() {} }, confirm: () => false }, ko: { computed: fn => fn, observable },
    rl: {
        adminArea: () => false, settings: { get: key => key === 'clientLanguage' ? 'en' : 'es' }, pluginPopupView: BasePopup,
        pluginRemoteRequest(callback, action, params) {
            Promise.resolve().then(() => responses(action, params))
                .then(result => callback(0, {Result: result}), () => callback(1));
        }
    },
    document: { documentElement: {lang: 'es'}, getElementById: () => ({content: {
        querySelector: () => ({prepend() {}})
    }}), createElement: () => ({setAttribute() {}}) },
    addEventListener: (name, fn) => { handlers[name] = fn; },
    setTimeout, clearTimeout, dispatchEvent() {}, CustomEvent: class {},
    sessionStorage: { removeItem() {} }
};
vm.runInNewContext(fs.readFileSync(__dirname + '/../unified-inbox.js', 'utf8'), context);
const view = {viewModelTemplateID: 'MailFolderList'};
handlers['rl-view-model.create']({detail: view});
const wait = () => new Promise(resolve => setTimeout(resolve, 10));
(async () => {
    responses = (action, params) => {
        if (action === 'UnifiedInboxList') return {ok:true, active:'a', accounts:['a','b','c'], options:{days:14,limit:50}};
        if (params.email === 'b') throw new Error('offline');
        return {ok:true,items:[{account:params.email,date:params.email==='a'?10:20,uid:1}],total:1,updated:1};
    };
    view.openUnifiedInbox();
    await wait();
    const panel = Popup.__vm;
    assert.equal(panel.t('title'),'Bandeja conjunta');
    assert.equal(view.unifiedInboxLabel(),'Bandeja conjunta');
    context.document.documentElement.lang='ca-ES'; languageChanged();
    assert.equal(panel.t('title'),'Safata conjunta');
    assert.equal(view.unifiedInboxLabel(),'Safata conjunta');
    context.document.documentElement.lang='es'; languageChanged();
    assert.equal(panel.t('title'),'Bandeja conjunta');
    console.log('OK: selected UI language overrides browser preference and changes reactively');
    assert.equal(panel.accounts().filter(a=>a.failed()).length, 1);
    assert.equal(panel.items().length, 2);
    assert.equal(panel.visibleItems()[0].account, 'c');
    panel.filter('a');
    assert.equal(panel.visibleItems().length, 1);
    assert.equal(panel.busy(), false);
    console.log('OK: partial failures, progressive merge, sorting and account filter');

    let marked;
    responses = (action, params) => { marked=params; return {ok:true}; };
    const secondary = panel.items().find(row=>row.account === 'c');
    await panel.mark(secondary);
    assert.equal(marked.email, 'c');
    assert.equal(panel.items().length, 1);
    assert.equal(panel.active, 'a');
    assert.equal(panel.accounts().find(a=>a.email==='c').status(), '0 · Lista');
    assert.equal(panel.notice(), 'Correo marcado como leído.');
    responses = () => {throw new Error('offline');};
    await panel.mark(panel.items()[0]);
    assert.equal(panel.items().length, 1);
    assert.ok(panel.error());
    assert.equal(panel.marking(), false);
    console.log('OK: mark read removes only the confirmed row; failure preserves the row and active account');

    context.document.documentElement.lang='ca'; languageChanged();
    let singularConfirmation;
    context.window.confirm = text => {singularConfirmation=text; return false;};
    await panel.markAll();
    assert.ok(singularConfirmation.includes('el missatge visible'));
    assert.ok(!singularConfirmation.includes('els 1 missatges'));
    assert.equal(panel.items().length,1);
    context.document.documentElement.lang='es'; languageChanged();
    context.window.confirm = () => false;
    console.log('OK: singular Catalan confirmation preserves the single visible message on cancellation');

    const first = {account:'a',date:3,uid:1}, second = {account:'a',date:2,uid:2}, other = {account:'c',date:1,uid:3};
    panel.items([first, second, other]); panel.filter('a');
    const writes = [];
    responses = (action, params) => {
        writes.push(params);
        if (params.uid === 2) throw new Error('offline');
        return {ok:true};
    };
    await panel.markAll();
    assert.equal(writes.length, 0);
    assert.equal(panel.items().length, 3);
    let confirmation;
    context.window.confirm = text => {confirmation=text;return true;};
    await panel.markAll();
    assert.ok(confirmation.includes('2') && confirmation.includes('«a»'));
    assert.equal(writes.length, 2);
    assert.ok(writes.every(row=>row.email === 'a'));
    assert.equal(panel.items().length, 2);
    assert.ok(panel.items().includes(second) && panel.items().includes(other));
    assert.equal(panel.notice(), 'Marcados como leídos: 1. Sin marcar: 1.');
    assert.ok(panel.error());
    assert.equal(panel.active, 'a');
    assert.equal(panel.marking(), false);
    panel.filter('');
    responses = () => ({ok:true});
    await panel.markAll();
    assert.equal(panel.items().length, 0);
    assert.equal(panel.notice(), 'Marcados como leídos: 2. Sin marcar: 0.');
    assert.equal(panel.error(), '');
    console.log('OK: bulk cancellation, filter scope, partial failures and retry across accounts');

    panel.items([first, second, other]);
    const pending = [];
    responses = () => new Promise(resolve => pending.push(resolve));
    const bulk = panel.markAll();
    await wait();
    assert.equal(pending.length, 2);
    panel.onHide();
    pending.forEach(resolve=>resolve({ok:true}));
    await bulk;
    assert.equal(pending.length, 2);
    assert.equal(panel.marking(), false);
    console.log('OK: closing during bulk work stops scheduling further messages');

    let selected = ['b'], failSave = false;
    const queried = [];
    responses = (action, params) => {
        if (action === 'UnifiedInboxList') return {ok:true,active:'a',accounts:['a','b','c'],selected,options:{days:14,limit:50}};
        if (action === 'UnifiedInboxSaveAccounts') {
            if (failSave) throw new Error('offline');
            selected = JSON.parse(params.selected);
            return {ok:true};
        }
        queried.push(params.email);
        return {ok:true,items:[{account:params.email,date:1,uid:1}],total:1,updated:1};
    };
    await panel.load(false);
    assert.deepEqual(queried, ['b']);
    assert.equal(panel.availableAccounts().length, 3);
    assert.equal(panel.accounts().length, 1);
    panel.availableAccounts().forEach(row => row.selected(row.email === 'c'));
    panel.filter('b');
    await panel.saveAccounts();
    assert.equal(JSON.stringify(selected), '["c"]');
    assert.equal(panel.filter(), '');
    assert.equal(panel.items()[0].account, 'c');
    assert.equal(queried.includes('a'), false);
    failSave = true;
    panel.availableAccounts()[0].selected(true);
    await panel.saveAccounts();
    assert.equal(panel.items()[0].account, 'c');
    assert.ok(panel.error());
    assert.equal(panel.saving(), false);
    failSave = false;
    panel.availableAccounts().forEach(row => row.selected(false));
    await panel.saveAccounts();
    assert.equal(panel.accounts().length, 0);
    assert.equal(panel.items().length, 0);
    await panel.load(false);
    assert.equal(panel.accounts().length, 0);
    assert.equal(queried.length, 2);
    console.log('OK: selection persistence, excluded accounts never queried, empty selection and save failure');

    let finishSave;
    let reloaded = false;
    responses = action => {
        if (action === 'UnifiedInboxSaveAccounts') return new Promise(resolve => {finishSave = resolve;});
        if (action === 'UnifiedInboxList') {
            reloaded = true;
            return {ok:true,active:'a',accounts:['a'],selected:[],options:{days:14,limit:50}};
        }
    };
    const saving = panel.saveAccounts();
    await wait();
    panel.onHide();
    panel.modalVisible = () => true;
    panel.beforeShow();
    finishSave({ok:true});
    await saving;
    await wait();
    assert.equal(reloaded, true);
    assert.equal(panel.accounts().length, 0);
    panel.modalVisible = () => false;
    console.log('OK: reopening during a pending save reloads the confirmed selection');

    let release;
    responses = action => action === 'UnifiedInboxList'
        ? {ok:true,active:'a',accounts:['a'],options:{days:14,limit:50}}
        : new Promise(resolve=>{release=resolve;});
    panel.load(false);
    await wait();
    panel.onHide();
    release({ok:true,items:[{date:9,uid:99}],total:1,updated:1});
    await wait();
    assert.equal(panel.items().length, 0);
    assert.equal(panel.busy(), false);
    console.log('OK: closing a panel ignores late responses');
})().catch(error => {console.error(error); process.exitCode=1;});
