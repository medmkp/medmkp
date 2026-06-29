import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Shrink the populate cost of medmkp_category_catalog_listing so the off-deploy
// refresh doesn't OOM the prod instance.
//
// The original grpinfo CTE (Migration20260629120000) array_agg'd over *every*
// categorized canonical product (~170k+ after singleton emit) — that full-table
// array materialization is what OOM-killed the in-migration build, and the
// off-deploy REFRESH runs the identical query, so it would OOM there too.
//
// But the final view inner-joins grpinfo to agg + best, both of which only carry
// (category_key, grp) pairs that have at least one priced offer. Every unpriced
// family is dropped by those joins anyway. So restrict grpinfo's aggregation to
// priced families up front (join cat -> agg): the displayed rows and all their
// per-family fields (variant_count counts the same cat rows, the array_agg picks
// are unchanged) are byte-for-byte identical, but the array_agg/group input
// shrinks from all categorized canonicals to just those in priced families.
//
// Recreated WITH NO DATA, same as the prior migration — the deploy migration
// stays instant and the view is populated off-deploy by
// refresh-catalog-read-models.ts on the NUC.
export class Migration20260629160000 extends Migration {

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
               cp."price_cents", cp."unit_price_cents"
        from "medmkp_canonical_product_match" m
        join "medmkp_supplier_current_price" cp on cp."supplier_product_id" = m."supplier_product_id"
        join "cat" on "cat"."id" = m."canonical_product_id"
        where m."match_status" not in ('unmatched', 'substitute') and m."deleted_at" is null
      ),
      "agg" as (
        select "category_key", "grp", count(*)::int as "offer_count"
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
