import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Indexes backing the catalog-landing queries (/medmkp/categories), which both
// filter/aggregate medmkp_supplier_catalog_listing by the computed expression
// lower(btrim(any_category)) over all 64k rows:
//   - best-value: per-category cheapest row (LATERAL LIMIT 1) — was ~2.4s
//   - supplier coverage: count(distinct supplier_id) per category — was ~1.2s
// Plain CREATE INDEX (CONCURRENTLY stalls on Render) over 64k rows is sub-second
// and can't OOM. ANALYZE so the planner picks up the expression-index stats —
// without it the expression indexes are ignored. After: best-value ~80ms,
// coverage ~0.7s.
export class Migration20260629180000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create index if not exists "IDX_medmkp_supplier_catalog_listing_anycat_price" on "medmkp_supplier_catalog_listing" (lower(btrim("any_category")), ("unit_price_cents" is null), "unit_price_cents", "price_cents");`);
    this.addSql(`create index if not exists "IDX_medmkp_supplier_catalog_listing_anycat_supplier" on "medmkp_supplier_catalog_listing" (lower(btrim("any_category")), "supplier_id");`);
    this.addSql(`analyze "medmkp_supplier_catalog_listing";`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_medmkp_supplier_catalog_listing_anycat_price";`);
    this.addSql(`drop index if exists "IDX_medmkp_supplier_catalog_listing_anycat_supplier";`);
  }

}
