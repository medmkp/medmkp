import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// The /medmkp/suppliers endpoint counted products per supplier live on every
// (cold) request — a count(*) over the full ~340k-row medmkp_supplier_product
// table, which on the 256MB-RAM prod DB scans ~350MB from disk and took ~7.5s.
// That endpoint backs the catalog landing, reorder list, plan and settings, so
// every one of those pages ate the 7.5s on a cold cache. The per-supplier count
// only changes on ingest, so materialize it and let the route join to it; the
// (rarely-changing) shipping-policy columns stay live on medmkp_supplier.
//
// Single-threaded + bounded work_mem so the create/refresh is fast and can't OOM.
export class Migration20260621140000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`SET LOCAL max_parallel_workers_per_gather = 0;`);
    this.addSql(`SET LOCAL work_mem = '64MB';`);
    this.addSql(`create materialized view if not exists "medmkp_supplier_product_count" as
      select p."supplier_id" as "supplier_id", count(*)::int as "product_count"
      from "medmkp_supplier_product" p
      where p."deleted_at" is null
      group by p."supplier_id";`);
    // Unique index doubles as the key required by REFRESH ... CONCURRENTLY.
    this.addSql(`create unique index if not exists "IDX_medmkp_supplier_product_count_supplier" on "medmkp_supplier_product_count" ("supplier_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop materialized view if exists "medmkp_supplier_product_count";`);
  }

}
