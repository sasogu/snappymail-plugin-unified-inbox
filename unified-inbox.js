/* global ko, rl */
(() => {
    'use strict';
    if (!window.rl || rl.adminArea()) return;
    const strings = {
        es: {
            title: 'Bandeja conjunta', subtitle: 'No leídos recientes de todas tus cuentas',
            all: 'Todas las cuentas', refresh: 'Actualizar', close: 'Cerrar', loading: 'Consultando…',
            error: 'No se pudo consultar. Comprueba la conexión y vuelve a intentarlo.',
            openError: 'No se pudo abrir el correo. Puede haberse movido o eliminado. Actualiza la bandeja.',
            empty: 'No hay mensajes en esta vista.', subject: '(Sin asunto)', cached: 'En caché',
            limits: 'Últimos {days} días · hasta {limit} mensajes por cuenta · solo INBOX',
            ready: 'Lista', more: 'Hay más mensajes que el límite mostrado.', opening: 'Abriendo correo…',
            markRead: 'Marcar como leído', marking: 'Marcando como leído…', marked: 'Correo marcado como leído.',
            markError: 'No se pudo marcar como leído. Actualiza la bandeja y vuelve a intentarlo.'
        },
        en: {
            title: 'Unified inbox', subtitle: 'Recent unread messages from all your accounts',
            all: 'All accounts', refresh: 'Refresh', close: 'Close', loading: 'Loading…',
            error: 'Could not load. Check your connection and try again.',
            openError: 'Could not open the message. It may have moved or been deleted. Refresh the inbox.',
            empty: 'No messages in this view.', subject: '(No subject)', cached: 'Cached',
            limits: 'Last {days} days · up to {limit} messages per account · INBOX only',
            ready: 'Ready', more: 'There are more messages than the display limit.', opening: 'Opening message…',
            markRead: 'Mark as read', marking: 'Marking as read…', marked: 'Message marked as read.',
            markError: 'Could not mark as read. Refresh the inbox and try again.'
        },
        ca: {
            title: 'Safata conjunta', subtitle: 'No llegits recents de tots els teus comptes',
            all: 'Tots els comptes', refresh: 'Actualitzar', close: 'Tancar', loading: 'Consultant…',
            error: 'No s’ha pogut consultar. Comprova la connexió i torna-ho a provar.',
            openError: 'No s’ha pogut obrir el correu. Pot haver-se mogut o eliminat. Actualitza la safata.',
            empty: 'No hi ha missatges en aquesta vista.', subject: '(Sense assumpte)', cached: 'En memòria cau',
            limits: 'Últims {days} dies · fins a {limit} missatges per compte · només INBOX',
            ready: 'Preparat', more: 'Hi ha més missatges que el límit mostrat.', opening: 'Obrint correu…',
            markRead: 'Marcar com a llegit', marking: 'Marcant com a llegit…', marked: 'Correu marcat com a llegit.',
            markError: 'No s’ha pogut marcar com a llegit. Actualitza la safata i torna-ho a provar.'
        }
    };
    const lang = () => String(rl.settings.get('clientLanguage') || document.documentElement.lang || 'en').slice(0, 2);
    const t = key => (strings[lang()] || strings.en)[key];
    // SnappyMail tracks timeouts by action, shared by concurrent account requests.
    // Use independent timers so one account cannot cancel another's request.
    const rpc = (action, params = {}) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(t('error'))), 45000);
        rl.pluginRemoteRequest((error, data) => {
            clearTimeout(timer);
            if (error || !data?.Result?.ok) reject(new Error(t('error')));
            else resolve(data.Result);
        }, action, params, 0);
    });
    const pendingKey = 'unified-inbox.destination.v1';
    const date = seconds => seconds ? new Date(seconds * 1000).toLocaleString(lang(), {
        dateStyle: 'short', timeStyle: 'short'
    }) : '';
    const color = email => {
        let hash = 0;
        for (const char of email) hash = (hash * 31 + char.charCodeAt(0)) | 0;
        return `hsl(${Math.abs(hash) % 360}, 65%, 40%)`;
    };

    class UnifiedInboxPopup extends rl.pluginPopupView {
        constructor() {
            super('UnifiedInbox');
            this.addObservables({ accounts: [], items: [], filter: '', busy: false, opening: false,
                marking: false, notice: '', error: '', limits: '' });
            this.t = t;
            this.date = date;
            this.color = color;
            this.generation = 0;
            this.active = '';
            this.visibleItems = ko.computed(() => this.items()
                .filter(item => !this.filter() || item.account === this.filter())
                .sort((a, b) => b.date - a.date || a.account.localeCompare(b.account) || b.uid - a.uid));
            this.filterOptions = ko.computed(() => [{email: '', label: t('all')}]
                .concat(this.accounts().map(account => ({email: account.email, label: account.email}))));
            this.refresh = () => this.load(true);
            this.openItem = item => this.open(item);
            this.markRead = item => this.mark(item);
        }

        beforeShow() { this.filter(''); this.load(false); }
        onHide() { ++this.generation; this.busy(false); }

        async load(force) {
            if (this.marking()) return;
            const generation = ++this.generation;
            this.busy(true); this.error(''); this.notice(''); this.items([]); this.accounts([]);
            try {
                const result = await rpc('UnifiedInboxList');
                if (generation !== this.generation) return;
                this.active = result.active;
                this.limits(t('limits').replace('{days}', result.options.days).replace('{limit}', result.options.limit));
                const accounts = result.accounts.map(email => ({
                    email, status: ko.observable(t('loading')), failed: ko.observable(false),
                    truncated: ko.observable(false), updated: ko.observable('')
                }));
                this.accounts(accounts);
                let next = 0;
                const worker = async () => {
                    while (next < accounts.length && generation === this.generation) {
                        const account = accounts[next++];
                        try {
                            const data = await rpc('UnifiedInboxAccount', { email: account.email, force: force ? 1 : 0 });
                            if (generation !== this.generation) return;
                            this.items([...this.items(), ...data.items]);
                            account.status(`${data.items.length} · ${t(data.cached ? 'cached' : 'ready')}`);
                            account.updated(date(data.updated));
                            account.truncated(data.total > result.options.limit);
                        } catch (error) {
                            if (generation !== this.generation) return;
                            account.status(t('error')); account.failed(true);
                        }
                    }
                };
                await Promise.all([worker(), worker()]);
            } catch (error) {
                if (generation === this.generation) this.error(t('error'));
            } finally {
                if (generation === this.generation) this.busy(false);
            }
        }

        async mark(item) {
            if (this.marking() || this.opening()) return;
            this.marking(true); this.error(''); this.notice('');
            const generation = this.generation;
            try {
                await rpc('UnifiedInboxMarkRead', {email: item.account, uid: item.uid,
                    uidvalidity: item.uidvalidity, message_id: item.message_id});
                if (generation !== this.generation) return;
                this.items(this.items().filter(row => row !== item));
                const account = this.accounts().find(row => row.email === item.account);
                if (account) account.status(`${this.items().filter(row => row.account === item.account).length} · ${t('ready')}`);
                this.notice(t('marked'));
            } catch (error) {
                if (generation === this.generation) this.error(t('markError'));
            } finally {
                this.marking(false);
                if (generation !== this.generation && this.modalVisible?.()) this.load(true);
            }
        }

        async open(item) {
            if (this.opening() || this.marking()) return;
            ++this.generation;
            this.busy(false);
            this.opening(true); this.error('');
            const target = {
                email: item.account, uid: item.uid, uidvalidity: item.uidvalidity,
                message_id: item.message_id, created: Date.now()
            };
            try {
                if (item.account !== this.active) {
                    sessionStorage.setItem(pendingKey, JSON.stringify(target));
                    await new Promise((resolve, reject) => {
                        rl.app.Remote.request('AccountSwitch', (error, data) => {
                            if (error || !data?.Result) reject(new Error(t('openError')));
                            else resolve();
                        }, { Email: item.account });
                    });
                    rl.route.reload();
                } else {
                    const located = await rpc('UnifiedInboxLocate', target);
                    this.close();
                    dispatchEvent(new CustomEvent('mailbox.message.show', { detail: located }));
                }
            } catch (error) {
                sessionStorage.removeItem(pendingKey);
                this.error(t('openError'));
            } finally { this.opening(false); }
        }
    }

    let resumed = false;
    addEventListener('rl-view-model.create', event => {
        const view = event.detail;
        if (view.viewModelTemplateID !== 'MailFolderList') return;
        const template = document.getElementById(view.viewModelTemplateID);
        if (!template?.content) return;
        view.openUnifiedInbox = () => UnifiedInboxPopup.showModal();
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'btn unified-inbox-launch';
        button.textContent = t('title');
        button.setAttribute('data-bind', 'click: openUnifiedInbox');
        template.content.querySelector('.b-content')?.prepend(button);
    });

    // The post-build event for MailMessageList fires after its message.show listener exists.
    addEventListener('rl-view-model', async event => {
        if (resumed || event.detail.viewModelTemplateID !== 'MailMessageList') return;
        resumed = true;
        let raw;
        try { raw = sessionStorage.getItem(pendingKey); sessionStorage.removeItem(pendingKey); }
        catch (error) { return; }
        if (!raw) return;
        try {
            const target = JSON.parse(raw);
            if (!target.created || Date.now() - target.created > 120000) return;
            const context = await rpc('UnifiedInboxList');
            if (context.active !== target.email) throw new Error(t('openError'));
            const located = await rpc('UnifiedInboxLocate', target);
            dispatchEvent(new CustomEvent('mailbox.message.show', { detail: located }));
        } catch (error) {
            UnifiedInboxPopup.showModal();
            // beforeShow clears errors synchronously, so set the notice afterwards.
            UnifiedInboxPopup.__vm?.error(t('openError'));
        }
    });

    // Invalidate active-account metadata after the normal viewer changes read state.
    let invalidation;
    addEventListener('mailbox.message.show', () => {
        clearTimeout(invalidation);
        invalidation = setTimeout(async () => {
            try {
                const context = await rpc('UnifiedInboxList');
                await rpc('UnifiedInboxInvalidate', { email: context.active });
            } catch (error) { /* Next refresh still expires the cache normally. */ }
        }, 15000);
    });
})();
