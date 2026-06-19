import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Add unit_price_cents to the medmkp_supplier_current_price read model so the
// category listing can rank cards by comparable per-unit price without a per-row
// join to supplier_product. Matviews can't ALTER ADD COLUMN, so we drop and
// recreate; the dependent medmkp_supplier_product_current_offer must be dropped
// first and recreated after (its definition only reads price_cents, unchanged).
export class Migration20260619120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop materialized view if exists "medmkp_supplier_product_current_offer";`);
    this.addSql(`drop materialized view if exists "medmkp_supplier_current_price";`);
    this.addSql(`create materialized view "medmkp_supplier_current_price" as select distinct on ("supplier_product_id") "supplier_product_id", "price_cents", "unit_price_cents", "captured_at" from "medmkp_supplier_price_snapshot" where "deleted_at" is null order by "supplier_product_id", "captured_at" desc;`);
    this.addSql(`create unique index if not exists "IDX_medmkp_supplier_current_price_product" on "medmkp_supplier_current_price" ("supplier_product_id");`);
    this.addSql(`create index if not exists "IDX_medmkp_supplier_current_price_amount" on "medmkp_supplier_current_price" ("price_cents") where "price_cents" > 0;`);
    this.addSql(`create materialized view "medmkp_supplier_product_current_offer" as select p."category", p."name", p."sku", p."supplier_id", p."id" as "supplier_product_id", price."price_cents" from "medmkp_supplier_product" p join "medmkp_supplier_current_price" price on price."supplier_product_id" = p."id" and price."price_cents" > 0 where p."deleted_at" is null and p."category" <> '' and lower(p."category") <> 'dental supplies' and lower(p."category") not in (select lower("name") from "medmkp_supplier" where "deleted_at" is null);`);
    this.addSql(`create unique index if not exists "IDX_medmkp_supplier_product_current_offer_product" on "medmkp_supplier_product_current_offer" ("supplier_product_id");`);
    this.addSql(`create index if not exists "IDX_medmkp_supplier_product_current_offer_category_price" on "medmkp_supplier_product_current_offer" ("category", "price_cents");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop materialized view if exists "medmkp_supplier_product_current_offer";`);
    this.addSql(`drop materialized view if exists "medmkp_supplier_current_price";`);
    this.addSql(`create materialized view "medmkp_supplier_current_price" as select distinct on ("supplier_product_id") "supplier_product_id", "price_cents", "captured_at" from "medmkp_supplier_price_snapshot" where "deleted_at" is null order by "supplier_product_id", "captured_at" desc;`);
    this.addSql(`create unique index if not exists "IDX_medmkp_supplier_current_price_product" on "medmkp_supplier_current_price" ("supplier_product_id");`);
    this.addSql(`create index if not exists "IDX_medmkp_supplier_current_price_amount" on "medmkp_supplier_current_price" ("price_cents") where "price_cents" > 0;`);
    this.addSql(`create materialized view "medmkp_supplier_product_current_offer" as select p."category", p."name", p."sku", p."supplier_id", p."id" as "supplier_product_id", price."price_cents" from "medmkp_supplier_product" p join "medmkp_supplier_current_price" price on price."supplier_product_id" = p."id" and price."price_cents" > 0 where p."deleted_at" is null and p."category" <> '' and lower(p."category") <> 'dental supplies' and lower(p."category") not in (select lower("name") from "medmkp_supplier" where "deleted_at" is null);`);
    this.addSql(`create unique index if not exists "IDX_medmkp_supplier_product_current_offer_product" on "medmkp_supplier_product_current_offer" ("supplier_product_id");`);
    this.addSql(`create index if not exists "IDX_medmkp_supplier_product_current_offer_category_price" on "medmkp_supplier_product_current_offer" ("category", "price_cents");`);
  }

}
