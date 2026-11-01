# Execution ledger — plan: docs/superpowers/plans/2026-11-01-marketplace.md

Owner approved the design and full staged execution on 2026-11-01.
Baseline: 691f8e3 (latest completed Tadserver release documentation). Reusing clean existing 0372 worktree on new codex/marketplace-v21-20261101 branch. Original F: checkout remains untouched.
Ruling: newer branch contains all aabf51f changes plus current deployed campaign/profile/Voice work and UTF8 test bootstrap; base implementation on it rather than regress production.
Preflight interfaces: Tasks 2–5 consume canonical variant/catalog contracts. Task 4 preserves closed financial capability flags; Task 7 must never enable them merely to expose seller drafts.
Task 1: in progress. SSH port 22 timed out twice from current connection; public HTTPS store returned 200.

2026-11-02 local continuation:
- Task1: baseline reconciled; latest live build matched HaKXpHDRvBqrMjDATnJzD and migration0031. Isolated Docker test PostgreSQL avoids Windows embedded setup stalls.
- Tasks2/3/5: catalog/search/variants/price/promotions, draft seller portal, moderated content/favorites/private references and portals implemented. Do not label external provider operation complete.
- Task4: variant/cap/price/shipping snapshot safety implemented and tested; item-level refunds, timed capacity, final agreement and independent delivery-release workflow remain unfinished.
- Task6: measured 50/200 HTTP load, 10,000 filter checks, 100/50 concurrent races and independent code review executed. Target met at50connections, not200. Broader suite is not green; detailed evidence in verification.md.
- Task7: backup/restore guarded script prepared and reviewed; publication not yet executed at this checkpoint.
- Ruling: add an explicit deletion-worker operational flag for restored staging; production default behavior remains enabled. Staging also removes live VTT signing ability.
- Ruling: catalog/seller-draft publication is a staged release, not completion of the entire master spec. Remaining domain gaps are recorded explicitly; real financial actions remain disabled.
