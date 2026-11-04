# Sales reporting

Add an always-available, read-only report to /admin/sales and the existing /seller/marketplace panel, preserving the current blue/cyan/gold design. Each row represents one store suborder and identifies the store, buyer, item snapshots, precise event timestamps, financial amounts and delivery status. Admin finance access is restricted to marketplace/super admins; seller access is restricted to their own OWNER/MANAGER stores.

Totals apply to all filtered rows, independent of cursor pagination. Paid, pending, cancelled and refunded values are distinct. Aggregate amounts remain exact decimal Rial strings; the UI formats exact Toman values and Tehran/Jalali timestamps. Unknown or inconsistent accounting evidence is shown explicitly. No transaction or settlement state is changed by reporting.

Implementation: isolated reporting API and tenant/financial integration tests; shared responsive report component; existing navigation integration. Validate targeted tests, API and Linux web builds, then deploy through the existing backup/restored-database guard with unchanged schema and preserved live data. Verify authenticated admin empty-state and seller authorization without production fixtures.
