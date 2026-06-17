import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Adds the GTIN/UPC barcode column to supplier products. DC Dental's NetSuite
// catalog exposes a fully-populated `upccode` (12-digit UPC-A), now captured by
// the ingestion (see ingestion/supplier-pipeline/adapters/dcdental.ts and the
// explicit `fields` request in product-extraction.ts). Indexed for the
// scanner's exact-barcode lookup path, mirroring the sku / manufacturer_sku
// scan indexes from Migration20260617190000. Partial on barcode IS NOT NULL so
// the index only covers the rows that actually carry one. Plain CREATE INDEX
// (not CONCURRENTLY): CONCURRENTLY stalls on Render behind long txns.
export class Migration20260617220000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_supplier_product" add column if not exists "barcode" text null;`);
    this.addSql(`create index if not exists "IDX_medmkp_supplier_product_barcode" on "medmkp_supplier_product" ("barcode") where "deleted_at" is null and "barcode" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_medmkp_supplier_product_barcode";`);
    this.addSql(`alter table if exists "medmkp_supplier_product" drop column if exists "barcode";`);
  }

}
