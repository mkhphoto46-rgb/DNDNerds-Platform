# Store subdomains and unique identities

Public shop roots use https://<unique ASCII slug>.dndnerds.ir and retain that host in the address bar by rewriting to the existing store page. Existing /store/<slug> and product URLs remain available; current UI is reused. Account, admin and other main-site pages redirect to the fixed apex domain; session cookies remain host-only. Seller panel exposes a copyable store address.

Display store names are unique after Persian letter, whitespace/joiner and ASCII case normalization; the database enforces this atomically across all create/rename paths. DNS labels are globally unique, 3..63 ASCII characters and exclude infrastructure labels. Additive migration0042 aborts on existing conflicts and never renames stores.

User selected retained subdomain and explicitly approved Tadserver DNS support request. Existing NS remain unchanged. Required records: wildcard A and acme A to existing VPS; _acme-challenge NS delegation to acme.dndnerds.ir. Dedicated authoritative challenge-only DNS enables automated wildcard TLS renewal. Existing TLS/Voice/mail routes are preserved. DNS availability and wildcard certificate are release gates for publicly claiming subdomain activation.

Validate tenant hostname parsing, root/query rewrite, main-domain redirects and CSRF preservation; API identity concurrency/normalization/legacy/admin tests; API and Linux web builds. Deploy with backup, restored throwaway DB, unchanged applied migration prefix and preserved existing rows. Verify existing real Moralin store using Host header before public DNS and HTTPS browser after certificate issuance.
