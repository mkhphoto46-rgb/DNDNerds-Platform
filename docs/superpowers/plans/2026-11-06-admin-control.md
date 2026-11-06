# Admin control implementation

Implement the owner's requested administrator editing/deletion of game tables, stores and products within the current blue/gold site. Reuse existing admin identities and password reauthentication, audit logs, signed VTT deletion queue, and catalog restrictions; do not create a parallel permission system or impersonate sellers.

- Add paginated/searchable admin resource lists and detail routes under /api/v1/admin/control. Active admins may read; SUPER_ADMIN and MARKETPLACE_ADMIN may mutate; SUPPORT stays read-only. All writes require password and reason, destructive operations additionally exact title/name.
- Tables: edit metadata/cover/status/capacity/admission, regenerate invitation, close/hide/restore; capacity cannot drop below accepted members, queued deletion cannot be reversed by editing. Actual deletion uses existing cross-store VTT cleanup and membership revocation.
- Stores: edit name/slug/description/category/status and featured designation. Removal archives the store (restorable), preserves orders/history, and hides its catalog.
- Products: edit metadata/slug/category/type/image/status and variant prices, quantities, discount dates and per-order limits. Archive/remove is restorable. Publication still requires active seller/store and valid variants. Inventory cannot fall below reserved stock; audit price and stock changes.
- Add a mobile-friendly /admin/control page with three resource tabs, search, pagination, detail editor, explicit confirmation and action state. Link it from admin home and existing market/game admin pages. Existing admin capabilities remain linked.
- Tests first: unauthorized/read-only/wrong password/ownership injection; edit non-owned resources; reserved capacity and inventory; publication gates; audit and archive/restore; actual table deletion stays queued when bridge is offline. No real production deletion or edits as tests.
- Run isolated PostgreSQL integration tests, API/Web builds, existing regression checks and mobile browser QA. Review permissions and cross-store deletion before guarded backed-up production release.
