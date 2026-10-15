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
class BasePopup {
    constructor() { Popup = this.constructor; }
    addObservables(values) { for (const [key, value] of Object.entries(values)) this[key] = observable(value); }
    close() { this.onHide(); }
    static showModal() { this.__vm = new this(); this.__vm.beforeShow(); }
}
const context = {
    window: { rl: true }, ko: { computed: fn => fn, observable },
    rl: {
        adminArea: () => false, settings: { get: () => 'es' }, pluginPopupView: BasePopup,
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
    assert.equal(panel.accounts().filter(a=>a.failed()).length, 1);
    assert.equal(panel.items().length, 2);
    assert.equal(panel.visibleItems()[0].account, 'c');
    panel.filter('a');
    assert.equal(panel.visibleItems().length, 1);
    assert.equal(panel.busy(), false);
    console.log('OK: partial failures, progressive merge, sorting and account filter');

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
