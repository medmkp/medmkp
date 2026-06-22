import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Performance: btree index on the canonical product handle so the product-page
// lookup (api/medmkp/canonical-products?handle=...) resolves by exact handle in
// ~1ms. That route matches handle/id/family_handle by equality; id (PK) and
// family_handle (btree) were already indexed, but handle only had a GIN trigram
// index — fine for ILIKE '%term%' search, but ~850ms-1s for an exact-equality
// lookup. Without a btree the planner fell back to the trigram scan (or, with the
// old ILIKE filter, a full seq scan of ~43k rows), making every PDP load ~2.6s.
//
// Like the trigram indexes (Migration20260617190000), on prod this is applied
// out-of-band with CREATE INDEX CONCURRENTLY (can't run in a migration
// transaction), so this is a no-op there; IF NOT EXISTS makes it build only on
// fresh DBs. Partial on "deleted_at" is null to match the soft-delete query
// pattern + existing index style.
export class Migration20260622120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create index if not exists "IDX_medmkp_canonical_product_handle" on "medmkp_canonical_product" ("handle") where "deleted_at" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_medmkp_canonical_product_handle";`);
  }

}
