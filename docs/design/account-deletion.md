# Account deletion (B49): design proposal

Status: proposal only, no code. **Needs internal and compliance review, and
possibly a DPIA (data protection impact assessment) under the internal policy,
before any build.** This document describes engineering options. It is not
legal advice, and the retention periods and legal bases below must be decided
by the people responsible for compliance.

## Problem

Neither the website nor the table app lets a user delete their account. There
is no route, button or documented process. Website sessions, the email
address, profiles, DM pages, characters, reviews, chat, and the table-app
account with its characters and chat stay until an operator removes them by
hand. The right to erasure under the GDPR (the EU data protection law) is the
main reason to fix this.

## Scope

- Website and API (this repository): the `users` row and everything linked
  to it.
- Table app (separate repository): the linked account, its characters and
  chat, and its seats at tables. It is reached through the signed bridge that
  the API already uses for invites, table status and table deletion.
- Out of scope here: backups and log retention. They need their own policy;
  see "Open questions".

## What the database does today when a user row is deleted

The foreign keys to `users.id` in `apps/api/drizzle/*.sql` fall into three
groups:

- **Cascade (deleted with the user):** sessions, two-factor (TOTP) settings,
  email action tokens, player and DM profiles, characters, game tables the user
  hosts, applications, reviews, arena listings they own, the whole social graph
  (friends, requests, blocks, groups, group messages, direct messages, social
  profile), the seller profile, store memberships, seller notification
  connections, and admin membership.
- **Set null (kept, author removed):** marketplace orders (`user_id`),
  refund-case actor columns, the arena opponent, subscription grants.
- **Restrict (blocks the delete):** admin audit logs, refund cases where the
  user is the buyer, refund evidence uploads, seller payout destinations and
  payout requests, the seller notification outbox, and site posts the user wrote.

So a plain `DELETE FROM users` fails for anyone with marketplace finance or
audit history. For everyone else it removes far more than the account; for
example, a DM's tables and every player's application to them go too. That is
why deletion needs a defined flow rather than a raw delete.

## Proposed flow

1. **Request.** The user opens Account, then "Delete my account", and
   re-enters their password (and their two-factor code if it is on). The page
   lists what will be deleted, what is kept and why, and the waiting period.
2. **Waiting period (proposal: 14 days).** The account becomes
   `PENDING_DELETION`: every session is revoked, sign-in is refused with a
   "cancel deletion" link sent by email, and public pages stop showing the
   user. The table app is told right away (step 4, with
   `reason: "account-deleted"`), so seats end at once.
3. **Erase (a background job, like the table-deletion worker).** The job
   runs in one transaction per user and can be retried:
   - Hosted tables go through the existing table-deletion path, so the table
     app removes them too and players get a revocation for each.
   - Cascade data is deleted.
   - Rows that must be kept (see the next section) are **anonymised**. The
     `users` row stays as a tombstone with the email, username, password hash
     and profile fields cleared, status `DELETED`, and a random replacement
     email that is unusable. The restrict-group rows then remain valid.
   - Reviews and messages the user wrote are deleted (cascade). If product
     owners prefer to keep reviews, they could be shown as "former member"
     instead; that is a decision for the review.
4. **Table-app bridge.** The API calls
   `POST {VTT_INTERNAL_URL}/api/platform/account-deleted` with the body
   `{"platformUserId": "<uuid>", "reason": "account-deleted"}`. The call is
   signed the same way as `/api/platform/membership-revoked` (the
   `X-Platform-Timestamp` and `X-Platform-Signature` headers, using an HMAC
   with `VTT_BRIDGE_SECRET`). Unlike the revocation call, it must **not** be
   fire-and-forget: the job stores a pending row and retries until the table
   app confirms. That is the same pattern as `game_table_deletions`.
5. **Confirmation.** A final email says the account was deleted and lists what
   was kept. No further emails are sent to that address.

## Data that may need to be kept (decision for compliance)

- **Marketplace orders, refunds, payouts, ledger postings:** accounting and
  tax rules may require keeping them for a fixed period. Proposal: keep the
  rows and anonymise the link to the person. The order's delivery-address
  snapshot holds personal data, and its retention period must be decided.
- **Admin audit logs:** they record who did what. Proposal: keep them, with
  personal fields (such as the email in `details`) replaced by the public ID.
- **Security records** (for example, rate-limit and abuse evidence): keep them
  only as long as needed.

## Things to fix first or alongside

- B34 (in review): database errors must not copy user content into logs.
- B40 (in review): public responses use public IDs, so a deleted user's UUID
  is not spread around.
- `seller_notification_outbox` and `site_posts` restrict deletion; their
  owners need a rule (anonymise or reassign).

## Open questions for the review

1. The legal basis and the retention period for each kept category (orders,
   payouts, audit, addresses).
2. Whether the waiting period is wanted, and how long it should be.
3. Backups: how long they are kept, and whether a restore must re-apply
   deletions (a "deleted users" list replayed after restore).
4. Logs: the retention period for the service journal, which today may hold
   older entries with user content (see B34).
5. Whether reviews and chat messages are deleted, or kept as "former member".
6. Whether operators need an admin-side deletion for requests that arrive by
   email, and how a request is verified then.
7. Whether a data export ("download my data") should ship with deletion.

## Rough build plan once approved

1. Schema: a `DELETED` and a `PENDING_DELETION` account status, plus an
   `account_deletions` job table.
2. API: request, cancel and the job, with integration tests for each foreign-key
   group (cascade, set null, restrict).
3. Table app: an `/api/platform/account-deleted` receiver that is idempotent.
4. Website: an account page section, and the emails.
5. Ops: documented backup and log handling.
