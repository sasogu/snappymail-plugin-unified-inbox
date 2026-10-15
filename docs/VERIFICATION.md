# Verification — 2026-10-15, version 0.1.4

## Mark all as read — version 0.3.0

- JavaScript tests cover cancellation without writes, account-filter scope,
  partial failures, retry across accounts and closing during a batch. The batch
  uses the existing authorized, identity-checked per-message endpoint with at
  most two concurrent requests. Failed rows remain visible.
- Chromium tests with synthetic data cover the actual bulk button, dismissal of
  its confirmation, accepting a filtered batch, accepting the remaining all-account
  batch and disabling the button on an empty view. No real unread messages are
  changed by these tests. Desktop/mobile demo screenshots were regenerated.
- Existing PHP cache/backend tests and JavaScript syntax checks pass.

## Mark as read — version 0.2.0

- PHP tests verify that a linked inactive account can mark only the resolved UID
  using `+FLAGS.SILENT (\Seen)`, without switching accounts. Stale mailbox
  generations, unlinked accounts, anonymous sessions and read-only mailboxes are
  rejected; successful marking invalidates the cached unread list.
- JavaScript tests verify confirmed removal, account count update, error recovery
  and preservation of the row on failure. Synthetic browser tests exercise the
  actual button and confirm that it does not navigate.
- Real API/IMAP integration uses already-read messages in the main and an
  additional account. The server confirms `\Seen`, the active account stays the
  same and unread UID sets remain unchanged. Run the local integration wrapper
  with `--mark-read-only` to repeat this focused, idempotent check.

## Initial release

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
