import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Read model backing the category drill-down listing (/app/catalog/[slug]).
// The category branch of /medmkp/canonical-products ranked each category's
// product families by best per-unit price *live* on every cache miss: scan the
// category's canonical products, join the full match graph + current-price
// model, DISTINCT ON for the cheapest offer, COUNT(*) OVER() for the total —
// then LIMIT 24. On the prod DB that ran 1-13s for the larger categories
// (Gloves ~13s), masked only by a 60s in-process cache, so the first visitor to
// any big category each minute ate the full query. Browse-by-supplier already
// solved the identical problem with medmkp_supplier_catalog_listing; this is the
// category-keyed twin. Precompute, per (category, product family), the family's
// best current offer + counts so the request path is a single indexed read
// (~60ms).
//
// Keyed on lower(btrim(category)) — the route normalizes the requested category
// the same way (trim + lowercase), so a plain equality lookup hits the index.
// The q/pattern (subcategory) variants still fall through to the live query;
// they run over the already category-scoped set and stay cheap.
//
// Created WITH NO DATA so the deploy migration never runs the heavy populate on
// the memory-constrained Render instance. The supplier twin populates in-migration
// fine, but this view's grpinfo CTE array_aggs over *every* categorized canonical
// product (~170k+ after singleton emit), which OOM-killed the backend mid-build and
// blocked the whole deploy ("Connection terminated unexpectedly"). The view is
// populated off-deploy by refresh-catalog-read-models.ts (run on the NUC against
// prod), the same path that already refreshes it; until the first refresh the read
// route falls back to the live query, so the listing still renders.
export class Migration20260629120000 extends Migration {

  override async up(): Promise<void> {
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
        select "category_key", "grp",
               count(*)::int as "variant_count",
               max("family_id") as "family_id",
               max("family_handle") as "family_handle",
               max("family_name") as "family_name",
               (array_agg("handle" order by "name"))[1] as "any_handle",
               (array_agg("name" order by "name"))[1] as "any_name",
               (array_agg("category" order by "name"))[1] as "any_category"
        from "cat" group by "category_key", "grp"
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
