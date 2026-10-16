# Changelog

## 0.4.2 — 2026-10-16

- Review Catalan grammar and terminology: imperative button labels, desar for
  saving, consistent vós instructions and clearer message descriptions.
- Use a singular confirmation for a single visible message; avoid ungrammatical
  number agreement in Catalan limit/progress labels.
- Add synthetic Catalan previews and a cancellation test for the singular scope.

## 0.4.1 — 2026-10-16

- Follow SnappyMail's selected interface language instead of the browser's
  preferred language, avoiding mixed languages between the webmail and plugins.
- Update the launcher and panel labels when the interface language changes.
- Verify different browser/interface preferences and live ES/CA switching with
  SnappyMail's actual Knockout text binding.

## 0.4.0 — 2026-10-16

- Add **Included accounts** with checkboxes and a saved per-user selection.
  Preferences follow the main account across linked-account switches and devices.
  Excluded inboxes are not queried or included in bulk actions. Support excluding
  the main account or all accounts; newly linked accounts are included by default.
  All accounts remain included until the user saves a selection.

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
