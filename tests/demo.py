#!/usr/bin/env python3
"""Render screenshots with synthetic data only; no login or mail access."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('UNIFIED_INBOX_URL', 'http://127.0.0.1:8100/')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900}, bypass_csp=True)
    page.goto(base, wait_until='networkidle')
    page.wait_for_function("typeof rl?.pluginRemoteRequest === 'function'")
    page.evaluate("() => rl.settings.set('clientLanguage', 'es')")
    page.evaluate('''html => {
        if (!document.getElementById('PopupsUnifiedInbox')) {
            const template=document.createElement('template');
            template.id='PopupsUnifiedInbox'; template.innerHTML=html; document.body.append(template);
        }
    }''', (Path(__file__).resolve().parents[1] / 'templates/PopupsUnifiedInbox.html').read_text())
    page.evaluate('''() => {
        rl.app.Remote.request = (action, callback, params) => {
            const accounts = ['personal@example.invalid', 'project@example.invalid', 'school@example.invalid'];
            const result = action === 'PluginUnifiedInboxList' ? {
                ok:true, accounts, active:accounts[0], options:{days:14,limit:50}
            } : {
                ok:true, cached:false,total:1,updated:Math.floor(Date.now()/1000),items:[{
                    account:params.email,folder:'INBOX',uid:1,uidvalidity:1,message_id:'<demo@example.invalid>',
                    date:Math.floor(Date.now()/1000)-accounts.indexOf(params.email)*3600,
                    subject:['Confirmación de la próxima reunión', 'Materiales para revisar', 'Recursos para la sesión práctica'][accounts.indexOf(params.email)],
                    sender:'Equipo de ejemplo <demo@example.invalid>'
                }]
            };
            setTimeout(()=>callback(0,{Result:result}), 20);
        };
    }''')
    page.add_script_tag(path=str(Path(__file__).resolve().parents[1] / 'unified-inbox.js'))
    page.evaluate('''() => {
        const view = {viewModelTemplateID:'MailFolderList'};
        dispatchEvent(new CustomEvent('rl-view-model.create', {detail:view}));
        view.openUnifiedInbox();
    }''')
    try:
        page.wait_for_function("document.querySelectorAll('.unified-inbox-item').length === 3", timeout=10000)
    except Exception:
        print(page.evaluate('''() => {
            const p=document.querySelector('.unified-inbox-panel'),v=p && ko.dataFor(p);
            return {panel:!!p,accounts:v?.accounts()?.length,items:v?.items()?.length,error:v?.error(),busy:v?.busy(),visible:v?.visibleItems()?.length,filter:v?.filter(),buttons:document.querySelectorAll('.unified-inbox-item').length};
        }'''))
        raise
    output = Path(__file__).resolve().parents[1] / 'docs'
    output.mkdir(exist_ok=True)
    page.locator('.unified-inbox-panel').screenshot(path=str(output / 'demo-desktop.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_function("document.querySelector('.unified-inbox-panel').getBoundingClientRect().width <= 390")
    page.locator('.unified-inbox-panel').screenshot(path=str(output / 'demo-mobile.png'))
    before = page.url
    page.locator('.unified-inbox-read').first.click()
    page.wait_for_function("document.querySelectorAll('.unified-inbox-item').length === 2")
    assert page.url == before
    assert page.locator('.unified-inbox-panel .alert-success').inner_text() == 'Correo marcado como leído.'
    page.once('dialog', lambda dialog: dialog.dismiss())
    page.locator('.unified-inbox-read-all').click()
    assert page.locator('.unified-inbox-item').count() == 2
    page.locator('.unified-inbox-controls select').select_option('school@example.invalid')
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('.unified-inbox-read-all').click()
    page.wait_for_function("document.querySelectorAll('.unified-inbox-item').length === 0")
    page.locator('.unified-inbox-controls select').select_option('')
    assert page.locator('.unified-inbox-item').count() == 1
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('.unified-inbox-read-all').click()
    page.wait_for_function("document.querySelectorAll('.unified-inbox-item').length === 0")
    assert page.locator('.unified-inbox-read-all').is_disabled()
    assert page.url == before
    browser.close()
    print('OK: synthetic screenshots, individual/bulk read, cancellation and account filter; no real-mail changes')
