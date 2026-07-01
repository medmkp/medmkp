import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Redefine medmkp_category_catalog_listing so offer_count is the number of
// DISTINCT suppliers, not the raw count of matched offers.
//
// The card's "N suppliers" badge reads offer_count. The prior definition counted
// every priced match in the family group (COUNT(*)), which double-counts: a
// family's offers span all of its size/spec variants, and one supplier can carry
// several packs of the same variant. So a multi-variant product showed an
// inflated supplier count (e.g. "15 suppliers" for a 5-size glove really carried
// by 3). Counting distinct supplier_id makes the badge match what the product
// page shows (one row per supplier). This mirrors the same change in the live
// CTE fallback (queryCategoryProducts).
//
// Everything else — best offer, variant_count, ranking, the per-family display
// fields — is byte-for-byte unchanged: priced gains a supplier_product join
// (by primary key, no row-set change) purely to expose supplier_id to agg.
//
// Recreated WITH NO DATA, same as the prior migrations — the deploy migration
// stays instant, the route falls back to the live CTE until the view is
// repopulated, and the off-deploy refresh (refresh-catalog-read-models.ts, which
// already lists this view and bootstraps its first non-concurrent populate) fills
// it on the NUC.
export class Migration20260701130000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop materialized view if exists "medmkp_category_catalog_listing";`);
    this.addSql(`create materialized view if not exists "medmkp_category_catalog_listing" as
      with "cat" as (
        select lower(btrim(c."category")) as "category_key",
               c."id", c."handle", c."name", c."category",
               c."family_id", c."family_handle", c."family_name",
               coalesce(c."family_id", c."id") as "grp"
        from "medmkp_canonical_product" c
        where c."deleted_at" is null and btrim(coalesce(c."category", '')) <> ''
      ),
      "priced" as (
        select "cat"."category_key", "cat"."grp", m."supplier_product_id",
               sp."supplier_id", cp."price_cents", cp."unit_price_cents"
        from "medmkp_canonical_product_match" m
        join "medmkp_supplier_current_price" cp on cp."supplier_product_id" = m."supplier_product_id"
        join "medmkp_supplier_product" sp on sp."id" = m."supplier_product_id"
        join "cat" on "cat"."id" = m."canonical_product_id"
        where m."match_status" not in ('unmatched', 'substitute') and m."deleted_at" is null
      ),
      "agg" as (
        select "category_key", "grp", count(distinct "supplier_id")::int as "offer_count"
        from "priced" group by "category_key", "grp"
      ),
      "best" as (
        select distinct on ("category_key", "grp")
               "category_key", "grp", "supplier_product_id" as "best_sp_id",
               "price_cents", "unit_price_cents"
        from "priced"
        order by "category_key", "grp", ("unit_price_cents" is null) asc, "unit_price_cents" asc, "price_cents" asc
      ),
      "grpinfo" as (
        select c."category_key", c."grp",
               count(*)::int as "variant_count",
               max(c."family_id") as "family_id",
               max(c."family_handle") as "family_handle",
               max(c."family_name") as "family_name",
               (array_agg(c."handle" order by c."name"))[1] as "any_handle",
               (array_agg(c."name" order by c."name"))[1] as "any_name",
               (array_agg(c."category" order by c."name"))[1] as "any_category"
        from "cat" c
        join "agg" a on a."category_key" = c."category_key" and a."grp" = c."grp"
        group by c."category_key", c."grp"
      )
      select g."category_key", g."grp", g."family_id", g."family_handle", g."family_name",
             g."variant_count", a."offer_count", g."any_handle", g."any_name", g."any_category",
             b."best_sp_id", b."price_cents", b."unit_price_cents"
      from "grpinfo" g
      join "agg" a on a."category_key" = g."category_key" and a."grp" = g."grp"
      join "best" b on b."category_key" = g."category_key" and b."grp" = g."grp"
      with no data;`);
    // Unique key (also required by REFRESH ... CONCURRENTLY).
    this.addSql(`create unique index if not exists "IDX_medmkp_category_catalog_listing_category_grp" on "medmkp_category_catalog_listing" ("category_key", "grp");`);
    // Serves the per-category ORDER BY price + LIMIT/OFFSET page query.
    this.addSql(`create index if not exists "IDX_medmkp_category_catalog_listing_category_price" on "medmkp_category_catalog_listing" ("category_key", "unit_price_cents", "price_cents");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop materialized view if exists "medmkp_category_catalog_listing";`);
  }

}
