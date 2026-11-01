# Voluntary support and private feedback

Published runtime commit `5ef96c0b393d97d2dde582bb0f3add2176fd8ff9` on dndnerds.ir.
Web build: `LQWiMQX2OpaAYeJx_f4bi`.
Release archive SHA256: `626ddf2df77a3fa25d60bf08475b58e5ee1fe9d96688e940edb6e2760937b7f0`.
Code backup: `/opt/dndnerds/backups/support-feedback-20261029T030309Z`; database backup service completed before deployment.

## Result

- Accounts remain free. The public plan reports zero price and unavailable checkout in free launch mode. `/pricing` redirects to `/support` (Next static redirect, verified in Chrome).
- `/support` provides voluntary manual transfers, D&D-themed copy and exact-value copy buttons. Recipient details are held in deployment-only `apps/web/support-public.json`, mode 600, outside the public directory and Git history.
- The hamburger has six direct links: the previous four destinations plus the explicitly requested support and feedback entries. At 320x568 it fits without menu scrolling.
- `/feedback` accepts authenticated text-only suggestions, criticism and comments. Strict request validation rejects attachment fields. Users see their own messages; administrators can review and change status with audit records. The administration view currently shows the latest 100 messages.
- Avatar limit is 500,000 bytes; header limit is 1,000,000 bytes. Frontend, API and database constraints agree. Player and DM update routes accept combined encoded image payloads.
- Migration `0030_support_feedback_profile_limits.sql` completed, including feedback storage and RLS.

## Verification

API and web production builds and typechecks passed. Real disposable PostgreSQL/Redis integration covered authentication, feedback persistence/privacy, administrative authorization and auditing, validation, rate limiting, free plans and full-size combined avatar/header saves for player and DM pages. Existing profile discovery regression passed. Independent review found no important correctness or security issues.

Live checks passed for support, feedback, administration, player/DM editors, play and VTT. Public transfer details and exact IBAN copying were verified. The production feedback form has no file input; authorized administration reads worked. Anonymous feedback history returned 401 and administration returned 403. The live profile editor labels show 500 KB and 1 MB. No production feedback submission or profile modification was made during verification.

Deployment unit `dnd-support-feedback-deploy-20261029` finished with `Result=success`, `ExecMainStatus=0`. The VTT server and secret environment file hashes remained unchanged. An initial environment-rewriting script preparation was rejected by automatic review; deployment instead used a separate allowlisted public configuration file and did not rewrite the environment file.
