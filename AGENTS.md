# Unified Inbox

Independent SnappyMail 2.38.2 plugin. Never edit the SnappyMail core.
PHP strict types; vanilla JavaScript with the existing Knockout/plugin API.
Increase VERSION whenever JavaScript, CSS or templates change.

Run `php tests/cache.php`, `php tests/backend.php`, `node --check unified-inbox.js`
and `node tests/ui.cjs`. Browser integration: `python3 tests/browser.py`.
Never print authentication data, cookies, subjects or sender addresses from real mail.
Do not save screenshots of real mail. Browser tests must never send mail or mark
unread messages as read; use an already-read message for opening checks.

Keep credentials and cached data outside this repository. Cache keys and account
authorization derive from the authenticated main account on the server.
Use text bindings, never HTML bindings, for message/account metadata.
