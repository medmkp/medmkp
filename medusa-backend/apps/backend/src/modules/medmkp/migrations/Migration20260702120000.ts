import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// The supplier platform's own id for the exact purchasable variant (e.g. the
// numeric Shopify variant id) so cart permalinks can be built from stored data
// instead of a live per-product storefront fetch. Nullable, no index: lookups
// arrive keyed by sku (already indexed) and filter to product_url in the route.
// Plain ADD COLUMN — instant, no table rewrite on Postgres.
export class Migration20260702120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_supplier_product" add column if not exists "external_variant_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_supplier_product" drop column if exists "external_variant_id";`);
  }

}
