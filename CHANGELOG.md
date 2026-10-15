# Changelog

## 0.3.0 — 2026-10-15

- Add **Mark all as read** for the currently visible messages, respecting the
  account filter and the displayed date/count limits. Confirm the scope and count
  before starting, show progress and report partial failures without removing
  failed messages. Closing the panel stops scheduling further messages; requests
  already in flight finish normally.

## 0.2.0 — 2026-10-15

- Add a per-message **Mark as read** button, without switching accounts or opening
  the viewer. Confirm the flag on the server before removing the row and updating
  the displayed count. Preserve the row on failure and invalidate account caches.
- Verify account authorization, mailbox generation and message identity before
  adding only the `\Seen` flag. Reject read-only mailboxes.

## 0.1.4 — 2026-10-15

- Progressive recent unread INBOX view across configured accounts, with two workers.
- Account filter, timestamps, partial failures and explicit display limits.
- Per-owner/account private metadata cache and forced refresh.
- Account switching with a short-lived tab-local destination; UIDVALIDITY checks
  and unambiguous Message-ID fallback before opening the normal mail viewer.
- Spanish, English and Catalan interface; configurable days, limit and cache TTL.
