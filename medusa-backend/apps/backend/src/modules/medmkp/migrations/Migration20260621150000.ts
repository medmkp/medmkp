import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Read model backing the "browse by supplier" listing (/app/catalog/supplier/<id>).
// Ranking thousands of a supplier's products by price live took ~11-28s on the
// prod DB (a supplier carries far more products than a single category, and the
// cross-supplier offer graph explodes). Precompute, per (supplier, product
// family), the supplier's own cheapest current offer + the family display fields,
// so the request path is a single indexed read (~60ms).
//
// Single-threaded + bounded work_mem so the create/refresh is fast and can't OOM.
export class Migration20260621150000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`SET LOCAL max_parallel_workers_per_gather = 0;`);
    this.addSql(`SET LOCAL work_mem = '64MB';`);
    this.addSql(`create materialized view if not exists "medmkp_supplier_catalog_listing" as
      with "off" as (
        select o."supplier_id", o."supplier_product_id", m."canonical_product_id"
        from "medmkp_supplier_product_current_offer" o
        join "medmkp_canonical_product_match" m on m."supplier_product_id" = o."supplier_product_id"
         and m."deleted_at" is null and m."match_status" not in ('unmatched', 'substitute')
      ),
      "fam" as (
        select "off"."supplier_id", "off"."supplier_product_id", coalesce(c."family_id", c."id") as "grp",
               c."family_id", c."family_handle", c."family_name", c."handle", c."name", c."category"
        from "off" join "medmkp_canonical_product" c on c."id" = "off"."canonical_product_id" and c."deleted_at" is null
      ),
      "priced" as (
        select "fam".*, cp."price_cents", cp."unit_price_cents"
        from "fam" join "medmkp_supplier_current_price" cp on cp."supplier_product_id" = "fam"."supplier_product_id"
      ),
      "best" as (
        select distinct on ("supplier_id", "grp")
               "supplier_id", "grp", "supplier_product_id" as "best_sp_id",
               "price_cents", "unit_price_cents", "family_id", "family_handle", "family_name"
        from "priced"
        order by "supplier_id", "grp", ("unit_price_cents" is null) asc, "unit_price_cents" asc, "price_cents" asc
      ),
      "info" as (
        select "supplier_id", "grp", count(distinct "supplier_product_id")::int as "variant_count",
               (array_agg("handle" order by "name"))[1] as "any_handle",
               (array_agg("name" order by "name"))[1] as "any_name",
               (array_agg("category" order by "name"))[1] as "any_category"
        from "fam" group by "supplier_id", "grp"
      )
      select b."supplier_id", b."grp", b."family_id", b."family_handle", b."family_name",
             i."variant_count", i."any_handle", i."any_name", i."any_category",
             b."best_sp_id", b."price_cents", b."unit_price_cents"
      from "best" b join "info" i on i."supplier_id" = b."supplier_id" and i."grp" = b."grp";`);
    // Unique key (also required by REFRESH ... CONCURRENTLY).
    this.addSql(`create unique index if not exists "IDX_medmkp_supplier_catalog_listing_supplier_grp" on "medmkp_supplier_catalog_listing" ("supplier_id", "grp");`);
    // Serves the per-supplier ORDER BY price + LIMIT/OFFSET page query.
    this.addSql(`create index if not exists "IDX_medmkp_supplier_catalog_listing_supplier_price" on "medmkp_supplier_catalog_listing" ("supplier_id", "unit_price_cents", "price_cents");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop materialized view if exists "medmkp_supplier_catalog_listing";`);
  }

}
