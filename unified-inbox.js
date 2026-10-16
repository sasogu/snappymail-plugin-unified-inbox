/* global ko, rl */
(() => {
    'use strict';
    if (!window.rl || rl.adminArea()) return;
    const strings = {
        es: {
            included: 'Cuentas incluidas', save: 'Guardar selección', saving: 'Guardando…',
            selectionHelp: 'Elige las cuentas que quieres reunir. Las cuentas nuevas se incluyen por defecto.',
            selectionEmpty: 'No hay cuentas incluidas. Selecciona alguna en «Cuentas incluidas».',
            saveError: 'No se pudo guardar la selección. Vuelve a intentarlo.',
            title: 'Bandeja conjunta', subtitle: 'No leídos recientes de tus cuentas seleccionadas',
            all: 'Todas las cuentas', refresh: 'Actualizar', close: 'Cerrar', loading: 'Consultando…',
            error: 'No se pudo consultar. Comprueba la conexión y vuelve a intentarlo.',
            openError: 'No se pudo abrir el correo. Puede haberse movido o eliminado. Actualiza la bandeja.',
            empty: 'No hay mensajes en esta vista.', subject: '(Sin asunto)', cached: 'En caché',
            limits: 'Últimos {days} días · hasta {limit} mensajes por cuenta · solo INBOX',
            ready: 'Lista', more: 'Hay más mensajes que el límite mostrado.', opening: 'Abriendo correo…',
            markRead: 'Marcar como leído', marking: 'Marcando como leído…', marked: 'Correo marcado como leído.',
            markError: 'No se pudo marcar como leído. Actualiza la bandeja y vuelve a intentarlo.',
            markAll: 'Marcar todo como leído',
            confirmOne: '¿Marcar como leído el mensaje visible de «{scope}»? Solo se incluye el mensaje de esta vista.',
            confirmAll: '¿Marcar como leídos los {count} mensajes visibles de «{scope}»? Solo se incluyen los mensajes de esta vista.',
            bulkProgress: 'Procesados {done} de {total}…',
            bulkDone: 'Marcados como leídos: {success}. Sin marcar: {failed}.'
        },
        en: {
            included: 'Included accounts', save: 'Save selection', saving: 'Saving…',
            selectionHelp: 'Choose the accounts to include. Newly linked accounts are included by default.',
            selectionEmpty: 'No accounts included. Select some under “Included accounts”.',
            saveError: 'Could not save the selection. Please try again.',
            title: 'Unified inbox', subtitle: 'Recent unread messages from your selected accounts',
            all: 'All accounts', refresh: 'Refresh', close: 'Close', loading: 'Loading…',
            error: 'Could not load. Check your connection and try again.',
            openError: 'Could not open the message. It may have moved or been deleted. Refresh the inbox.',
            empty: 'No messages in this view.', subject: '(No subject)', cached: 'Cached',
            limits: 'Last {days} days · up to {limit} messages per account · INBOX only',
            ready: 'Ready', more: 'There are more messages than the display limit.', opening: 'Opening message…',
            markRead: 'Mark as read', marking: 'Marking as read…', marked: 'Message marked as read.',
            markError: 'Could not mark as read. Refresh the inbox and try again.',
            markAll: 'Mark all as read',
            confirmOne: 'Mark the visible message in “{scope}” as read? Only the message in this view is included.',
            confirmAll: 'Mark the {count} visible messages in “{scope}” as read? Only messages in this view are included.',
            bulkProgress: 'Processed {done} of {total}…',
            bulkDone: 'Marked as read: {success}. Not marked: {failed}.'
        },
        ca: {
            included: 'Comptes inclosos', save: 'Desa la selecció', saving: 'S’està desant…',
            selectionHelp: 'Trieu els comptes que voleu reunir. Els comptes nous s’inclouen per defecte.',
            selectionEmpty: 'No hi ha comptes inclosos. Trieu-ne algun a «Comptes inclosos».',
            saveError: 'No s’ha pogut desar la selecció. Torneu-ho a provar.',
            title: 'Safata conjunta', subtitle: 'Missatges no llegits recents dels comptes seleccionats',
            all: 'Tots els comptes', refresh: 'Actualitza', close: 'Tanca', loading: 'S’està consultant…',
            error: 'No s’ha pogut consultar el correu. Comproveu la connexió i torneu-ho a provar.',
            openError: 'No s’ha pogut obrir el missatge. Pot ser que s’hagi mogut o eliminat. Actualitzeu la safata.',
            empty: 'No hi ha missatges en aquesta vista.', subject: '(Sense assumpte)', cached: 'En memòria cau',
            limits: 'Antiguitat màxima en dies: {days} · límit de missatges per compte: {limit} · només INBOX',
            ready: 'A punt', more: 'Hi ha més missatges que el límit mostrat.', opening: 'S’està obrint el missatge…',
            markRead: 'Marca com a llegit', marking: 'S’està marcant com a llegit…', marked: 'Correu marcat com a llegit.',
            markError: 'No s’ha pogut marcar com a llegit. Actualitzeu la safata i torneu-ho a provar.',
            markAll: 'Marca-ho tot com a llegit',
            confirmOne: 'Voleu marcar com a llegit el missatge visible de «{scope}»? Només s’inclou el missatge d’aquesta vista.',
            confirmAll: 'Voleu marcar com a llegits els {count} missatges visibles de «{scope}»? Només s’inclouen els missatges d’aquesta vista.',
            bulkProgress: 'Progrés: {done} de {total}…',
            bulkDone: 'Marcats com a llegits: {success}. Sense marcar: {failed}.'
        }
    };
    // clientLanguage is the browser preference, not SnappyMail's selected language.
    const readLanguage = () => String(document.documentElement.lang || rl.settings.get('language') || 'en')
        .toLowerCase().split(/[-_]/)[0];
    const language = ko.observable(readLanguage());
    const lang = () => language();
    if (window.MutationObserver) {
        new window.MutationObserver(() => language(readLanguage())).observe(document.documentElement,
            {attributes: true, attributeFilter: ['lang']});
    }
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
                marking: false, saving: false, availableAccounts: [], notice: '', error: '', limits: '' });
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
            this.markAllRead = () => this.markAll();
            this.saveSelection = () => this.saveAccounts();
        }

        beforeShow() { this.filter(''); this.load(false); }
        onHide() { ++this.generation; this.busy(false); }

        async saveAccounts() {
            if (this.busy() || this.marking() || this.opening() || this.saving()) return;
            const selected = this.availableAccounts().filter(row => row.selected()).map(row => row.email);
            const generation = this.generation;
            this.saving(true); this.error('');
            try {
                await rpc('UnifiedInboxSaveAccounts', {selected: JSON.stringify(selected)});
            } catch (error) {
                if (generation === this.generation) this.error(t('saveError'));
                return;
            } finally {
                this.saving(false);
                if (generation !== this.generation && this.modalVisible?.()) this.load(false);
            }
            if (generation === this.generation) {
                this.filter('');
                await this.load(false);
            }
        }

        async load(force) {
            if (this.marking() || this.saving()) return;
            const generation = ++this.generation;
            this.busy(true); this.error(''); this.notice(''); this.items([]); this.accounts([]); this.availableAccounts([]);
            try {
                const result = await rpc('UnifiedInboxList');
                if (generation !== this.generation) return;
                this.active = result.active;
                this.limits(t('limits').replace('{days}', result.options.days).replace('{limit}', result.options.limit));
                const selected = result.selected || result.accounts;
                this.availableAccounts(result.accounts.map(email => ({email, selected: ko.observable(selected.includes(email))})));
                const accounts = result.accounts.filter(email => selected.includes(email)).map(email => ({
                    email, status: ko.observable(t('loading')), failed: ko.observable(false),
                    truncated: ko.observable(false), updated: ko.observable('')
                }));
                this.accounts(accounts);
                if (this.filter() && !accounts.some(row => row.email === this.filter())) this.filter('');
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

        async applyRead(item, generation) {
            await rpc('UnifiedInboxMarkRead', {email: item.account, uid: item.uid,
                uidvalidity: item.uidvalidity, message_id: item.message_id});
            if (generation !== this.generation) return;
            this.items(this.items().filter(row => row !== item));
            const account = this.accounts().find(row => row.email === item.account);
            if (account) account.status(`${this.items().filter(row => row.account === item.account).length} · ${t('ready')}`);
        }

        async markAll() {
            if (this.marking() || this.opening() || this.busy() || this.saving()) return;
            const items = this.visibleItems().slice();
            if (!items.length || !window.confirm(t(items.length === 1 ? 'confirmOne' : 'confirmAll')
                .replace('{count}', items.length).replace('{scope}', this.filter() || t('all')))) return;
            const generation = this.generation;
            let next = 0, success = 0, failed = 0;
            this.marking(true); this.error(''); this.notice('');
            const worker = async () => {
                while (next < items.length && generation === this.generation) {
                    const item = items[next++];
                    try { await this.applyRead(item, generation); ++success; }
                    catch (error) { ++failed; }
                    if (generation === this.generation) this.notice(t('bulkProgress')
                        .replace('{done}', success + failed).replace('{total}', items.length));
                }
            };
            try {
                await Promise.all([worker(), worker()]);
                if (generation === this.generation) {
                    this.notice(t('bulkDone').replace('{success}', success).replace('{failed}', failed));
                    if (failed) this.error(t('markError'));
                }
            } finally {
                this.marking(false);
                if (generation !== this.generation && this.modalVisible?.()) this.load(true);
            }
        }

        async mark(item) {
            if (this.marking() || this.opening() || this.saving()) return;
            this.marking(true); this.error(''); this.notice('');
            const generation = this.generation;
            try {
                await this.applyRead(item, generation);
                if (generation !== this.generation) return;
                this.notice(t('marked'));
            } catch (error) {
                if (generation === this.generation) this.error(t('markError'));
            } finally {
                this.marking(false);
                if (generation !== this.generation && this.modalVisible?.()) this.load(true);
            }
        }

        async open(item) {
            if (this.opening() || this.marking() || this.saving()) return;
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
        view.unifiedInboxLabel = () => t('title');
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'btn unified-inbox-launch';
        button.textContent = t('title');
        button.setAttribute('data-bind', 'click: openUnifiedInbox, text: unifiedInboxLabel()');
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
