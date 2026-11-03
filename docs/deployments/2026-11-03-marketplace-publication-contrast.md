# 2026-11-03 — Readable controls and direct product publication

Owner reported white text on native white controls and an existing seller product missing from the public catalog. Live browser inspection reproduced button background rgb(240,240,240) with rgb(247,245,239) text. Read-only DB inspection found one real product saved as DRAFT, with a valid SKU/inventory and ACTIVE store but no identity evidence.

The owner explicitly chose «فروشندهٔ فعال مستقیم محصول را منتشر کند». This supersedes the earlier document's identity-before-catalog-publication rule. Identity badge and financial gates remain independent.

- Source delta: `5cafb43bebf50c3bf7f350fba57aa3a0382fffab`.
- Linux Web build: `6xmoz6WpcP2jzEWPlS4jv`; previous `XrEusdINN1Di3H8JRK91l`.
- Archive SHA256: `acf0ddc478321b5fda8f2e7193543a54adf8cf6618bb00a43213a27413be44d8`, 21,478,203 bytes.
- API delta: admin route registration and new `marketplace/product-publishing.js`; other live API/VTT files preserved.
- No new migrations; live journal remains0035 / `1793664000002`.
- Backup `/opt/dndnerds/backups/join-before-20261103T142440Z`; restore16.74seconds; preserved18users/7game tables/0orders/1product.
- Released=true; privateSettingsPreserved=true; existingRowsPreserved=true; financialWritesDisabled=true.

Active sellers can publish/unpublish their own products; product-editor membership, active seller/store and a valid active SKU/inventory are enforced. New-product UI creates then publishes, explains a failed publication and preserves the draft for explicit retry. Existing drafts have a publish button. Admin publication remains reauthenticated. No identity proof or badge is fabricated.

Low-specificity dark bases now cover native buttons, inputs, textarea, select/options, placeholders and checkbox/radio appearance, leaving component-specific gold/cyan variants in control. Live browser after release measured the formerly unreadable search button as rgb(11,45,66) background / rgb(247,245,239) text, contrast13.119:1. Disabled textarea also uses the dark base. Existing guild art/navigation were preserved.

Targeted integration2/2 passed (after red404), API and Linux Web builds passed, guarded restore/health/public route checks passed. No new real product or test purchase was created. Per the owner's explicit direct-publication request, the already-created product `98da938f-6fe7-4fbf-9b80-f0938ba30f08` was published through the same transactional publication service with an audit reason under the single active owner administrator. API and browser confirmed it in `/store` and at https://dndnerds.ir/store/moralin/pirate, including its actual image, price and variant. Store verified remainsfalse.

Local browser evidence (private working artifacts): `.deploy/marketplace/contrast-fixed-20261103.jpg`, `.deploy/marketplace/published-pirate-20261103.jpg`.
