#!/usr/bin/env python3
"""Private integration: no mail bodies, credentials, cookies or real-mail screenshots in output."""
from pathlib import Path
import imaplib
import os
import subprocess
import sys
from playwright.sync_api import sync_playwright

required = ['UNIFIED_INBOX_URL', 'UNIFIED_INBOX_MAIN_EMAIL', 'UNIFIED_INBOX_PASSWORD_FILE',
            'UNIFIED_INBOX_SECONDARY_EMAIL', 'UNIFIED_INBOX_SECONDARY_PASS_ENTRY']
if any(not os.environ.get(key) for key in required):
    print('Configure the integration environment variables listed in README.md.')
    sys.exit(2)
BASE = os.environ['UNIFIED_INBOX_URL']
MAIN = os.environ['UNIFIED_INBOX_MAIN_EMAIL']
IMAP_HOST = os.environ.get('UNIFIED_INBOX_IMAP_HOST', 'imap.gmail.com')


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    print('OK:', label, flush=True)


def rpc(page, action, params=None, core=False):
    data = page.evaluate('''({action, params, core}) => new Promise(resolve => {
        const callback = (error, data) => resolve({error, result: data?.Result});
        if (core) rl.app.Remote.request(action, callback, params, 45000);
        else rl.pluginRemoteRequest(callback, action, params, 45000);
    })''', {'action': action, 'params': params or {}, 'core': core})
    if data.get('result') is None:
        print('RPC incomplete:', action, 'code:', data.get('error'), flush=True)
        raise RuntimeError('Incomplete RPC')
    return data


def read_sample(mailbox):
    mailbox.select('INBOX', readonly=True)
    status, matches = mailbox.uid('search', None, 'SEEN')
    if status != 'OK' or not matches[0]:
        return None
    uid = int(matches[0].split()[-1])
    return {'uid': uid, 'uidvalidity': int(mailbox.response('UIDVALIDITY')[1][0]), 'message_id': ''}


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                         args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.set_default_timeout(60000)
    errors = []
    login_codes = []
    page.on('pageerror', lambda error: errors.append(type(error).__name__))
    def on_response(response):
        if 'Json' not in response.url:
            return
        try:
            data = response.json()
            if data.get('Action') == 'Login':
                login_codes.append({'code': data.get('ErrorCode', data.get('code', 0)),
                                    'authenticated': bool((data.get('Result') or {}).get('Auth'))})
        except Exception:
            pass
    page.on('response', on_response)
    try:
        page.goto(BASE, wait_until='domcontentloaded')
        print('Comprobando formulario de acceso…', flush=True)
        password = Path(os.environ['UNIFIED_INBOX_PASSWORD_FILE']).read_text().splitlines()[0].strip()
        page.locator('input[name=Email]').fill(MAIN)
        page.locator('input[name=Password]').fill(password)
        page.get_by_role('button', name='Acceder', exact=True).click()
        print('Esperando la interfaz autenticada…', flush=True)
        page.locator('.unified-inbox-launch').wait_for()
        check(True, 'plugin disponible tras iniciar sesión')
        if os.environ.get('UNIFIED_INBOX_CHECK_SEGUIMIENTO') == '1':
            check(page.locator('.seguimiento-launch').count() == 1, 'plugin Seguimiento conservado')
        context = rpc(page, 'UnifiedInboxList')['result']
        check(context['ok'] and len(context['accounts']) >= 2, 'cuentas vinculadas disponibles')
        rejected = rpc(page, 'UnifiedInboxAccount', {'email': 'outsider@example.invalid'})['result']
        check(not rejected['ok'] and 'items' not in rejected, 'rechaza cuentas ajenas')
        guest = browser.new_page()
        guest.goto(BASE, wait_until='networkidle')
        rejected = rpc(guest, 'UnifiedInboxList')['result']
        check(rejected and not rejected['ok'] and 'accounts' not in rejected, 'rechaza sesiones anónimas')
        guest.close()

        mailbox = imaplib.IMAP4_SSL(IMAP_HOST, timeout=20)
        mailbox.login(MAIN, password)
        mailbox.select('INBOX', readonly=True)
        unseen_before = mailbox.uid('search', None, 'UNSEEN')[1][0]
        page.locator('.unified-inbox-launch').click()
        page.wait_for_function('''() => {
            const panel = document.querySelector('.unified-inbox-panel');
            const view = panel && ko.dataFor(panel);
            return view && !view.busy() && view.accounts().length >= 2;
        }''', timeout=180000)
        stats = page.evaluate('''() => {
            const view = ko.dataFor(document.querySelector('.unified-inbox-panel'));
            return {accounts:view.accounts().length, failed:view.accounts().filter(a=>a.failed()).length,
                items:view.items().length, visible:view.visibleItems().length, error:!!view.error(),
                sorted:view.visibleItems().every((x,i,a)=>!i || a[i-1].date >= x.date)};
        }''')
        print('Estado del panel:', stats, flush=True)
        check(not stats['error'] and stats['accounts'] - stats['failed'] >= 2, 'consulta de varias cuentas con fallos aislados')
        check(stats['sorted'], 'lista ordenada por fecha')
        check(stats['visible'] == stats['items'], 'vista inicial muestra todas las cuentas')
        print('Cuentas consultadas:', stats['accounts'], 'Mensajes mostrados:', stats['items'], flush=True)
        mailbox.noop()
        unseen_after = mailbox.uid('search', None, 'UNSEEN')[1][0]
        check(unseen_before == unseen_after, 'consultar no cambia los mensajes no leídos')

        cached = rpc(page, 'UnifiedInboxAccount', {'email': context['active']})['result']
        check(cached['ok'] and cached['cached'], 'caché por cuenta reutilizada')
        fresh = rpc(page, 'UnifiedInboxAccount', {'email': context['active'], 'force': 1})['result']
        check(fresh['ok'] and not fresh['cached'], 'actualización forzada consulta IMAP')
        page.locator('.unified-inbox-controls select').select_option(context['accounts'][1])
        check(page.evaluate('''() => {
            const v=ko.dataFor(document.querySelector('.unified-inbox-panel'));
            return v.visibleItems().every(i=>i.account===v.filter());
        }'''), 'filtro por cuenta')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_function('''() => {
            const b=document.querySelector('.unified-inbox-panel').getBoundingClientRect();
            return b.x >= 0 && b.width <= 390;
        }''')
        bounds = page.locator('.unified-inbox-panel').bounding_box()
        print('Dimensiones móviles:', {key: round(bounds[key]) for key in ['x', 'width']}, flush=True)
        check(bounds['x'] >= 0 and bounds['width'] <= 390, 'panel utilizable en móvil tras ajustar la ventana')
        page.set_viewport_size({'width': 1280, 'height': 900})

        sample = read_sample(mailbox)
        check(sample is not None, 'mensaje ya leído disponible para probar apertura')
        target = dict(sample, email=context['active'])
        located = rpc(page, 'UnifiedInboxLocate', target)['result']
        check(located['ok'] and located['uid'] == sample['uid'], 'localiza UID con UIDVALIDITY válido')
        invalid = rpc(page, 'UnifiedInboxLocate', dict(target, uidvalidity=sample['uidvalidity'] + 1))['result']
        check(not invalid['ok'], 'rechaza UID de otra generación del buzón')
        missing = rpc(page, 'UnifiedInboxLocate', dict(target, uid=4294967294, message_id=''))['result']
        check(not missing['ok'], 'mensaje eliminado no abre otro correo')
        page.evaluate('''item => ko.dataFor(document.querySelector('.unified-inbox-panel')).open(item)''',
                      dict(sample, account=context['active']))
        page.wait_for_function('''uid => ko.dataFor(document.querySelector('#V-MailMessageView .top-toolbar'))?.message()?.uid == uid''', arg=sample['uid'])
        check(True, 'abre un mensaje en la cuenta activa')
        mailbox.logout()

        secondary = os.environ['UNIFIED_INBOX_SECONDARY_EMAIL']
        secondary_password = subprocess.check_output(['pass', 'show', os.environ['UNIFIED_INBOX_SECONDARY_PASS_ENTRY']], text=True).splitlines()[0].strip()
        other = imaplib.IMAP4_SSL(os.environ.get('UNIFIED_INBOX_SECONDARY_IMAP_HOST', IMAP_HOST), timeout=20)
        other.login(secondary, secondary_password)
        second_sample = read_sample(other)
        other.logout()
        check(second_sample is not None, 'mensaje ya leído disponible en una cuenta adicional')
        page.locator('.unified-inbox-launch').click()
        page.wait_for_function('''() => !ko.dataFor(document.querySelector('.unified-inbox-panel')).busy()''', timeout=180000)
        print('Comprobando navegación a la cuenta adicional…', flush=True)
        with page.expect_navigation(wait_until='domcontentloaded'):
            page.evaluate('''item => {ko.dataFor(document.querySelector('.unified-inbox-panel')).open(item);}''',
                          dict(second_sample, account=secondary))
        print('Recarga de cuenta completada; comprobando destino…', flush=True)
        page.wait_for_function('''uid => ko.dataFor(document.querySelector('#V-MailMessageView .top-toolbar'))?.message()?.uid == uid''', arg=second_sample['uid'])
        active = rpc(page, 'UnifiedInboxList')['result']['active']
        check(active == secondary, 'cambia de cuenta y abre el mensaje tras la recarga')
        check(page.evaluate("sessionStorage.getItem('unified-inbox.destination.v1') === null"), 'destino temporal eliminado')
        # Return the browser session to its original account.
        check(not rpc(page, 'AccountSwitch', {'Email': context['active']}, core=True)['error'], 'restaura la cuenta principal')
        check(not errors, 'sin errores JavaScript')
    except Exception as error:
        # Deliberately omit exception text, DOM, requests and traces (private mail).
        print('FALLO:', type(error).__name__, flush=True)
        print('Login codes:', login_codes, 'JS errors:', len(errors),
              'Panel buttons:', page.locator('.unified-inbox-launch').count(), flush=True)
        sys.exit(1)
    finally:
        browser.close()
