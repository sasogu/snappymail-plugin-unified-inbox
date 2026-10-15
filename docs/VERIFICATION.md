# Verification — 2026-10-15, version 0.1.4

Target: SnappyMail 2.38.2, PHP in the pinned deployment container, existing
Seguimiento and account-login mapping plugins enabled.

Passed:

- PHP syntax checks; `php tests/cache.php`; `php tests/backend.php`.
- `node --check unified-inbox.js`; `node tests/ui.cjs`.
- Existing deployment's Seguimiento store tests, startup shell syntax,
  configuration PHP syntax and `docker compose config --quiet`.
- Complete Chromium/Playwright integration against the local deployment through
  loopback: nine linked accounts, 152 displayed unread messages at test time,
  default all-account view, sorting, filtering, cache reuse and forced refresh.
- Main-account IMAP unread UID set unchanged after listing.
- Guest and unlinked-account requests denied.
- Valid UID/UIDVALIDITY resolution, old-generation UID rejection and missing UID
  rejection; opening already-read messages in the active and an additional
  account, including reload, destination consumption and return to the main account.
- Mobile viewport 390 px: panel width 368 px, x=11 px; no JavaScript errors.
- Demo screenshots generated without authentication using synthetic metadata only.

HTTPS/Tailscale also loaded the plugin and successfully exercised account
switching during development. Repeated full runs through that URL intermittently
reported fetch/navigation errors; no PHP fatal, memory or upstream errors were
found in the inspected container logs. The cause was not established. The final
complete run passed through loopback. No Tailscale configuration was changed.

No SMTP requests were made. No credentials, cookies, bodies or real-mail
screenshots are included in this repository. Mail counts are observations from
the test run and will change over time.
