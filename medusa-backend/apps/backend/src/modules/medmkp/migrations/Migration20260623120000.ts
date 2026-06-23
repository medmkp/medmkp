import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Phase 2: scan sessions — stateful, resumable inventory audits at a location.
//   medmkp_scan_session       — one audit run (per practice, per location)
//   medmkp_scan_session_line  — one scanned item, with the lot/expiry decoded
//                               off the package; promoted to inventory on confirm
// Purely additive (create-only, IF NOT EXISTS); no changes to existing tables.
// Btree partial indexes on the equality-filter columns (scan_session.practice_id
// + location_id, scan_session_line.session_id) match the list-route patterns and
// the existing soft-delete index style.
export class Migration20260623120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medmkp_scan_session" ("id" text not null, "practice_id" text not null, "location_id" text not null, "name" text null, "status" text not null default 'active', "started_by" text null, "completed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_scan_session_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "IDX_medmkp_scan_session_practice_id" on "medmkp_scan_session" ("practice_id") where "deleted_at" is null;`);
    this.addSql(`create index if not exists "IDX_medmkp_scan_session_location_id" on "medmkp_scan_session" ("location_id") where "deleted_at" is null;`);

    this.addSql(`create table if not exists "medmkp_scan_session_line" ("id" text not null, "session_id" text not null, "barcode" text null, "canonical_product_id" text null, "supplier_product_id" text null, "name" text not null, "image_url" text null, "quantity" numeric not null default 1, "shelf_area" text null, "lot_number" text null, "expiration_date" timestamptz null, "production_date" timestamptz null, "package_condition" text null, "status" text not null default 'needs_review', "inventory_item_id" text null, "scanned_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_scan_session_line_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "IDX_medmkp_scan_session_line_session_id" on "medmkp_scan_session_line" ("session_id") where "deleted_at" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medmkp_scan_session_line" cascade;`);
    this.addSql(`drop table if exists "medmkp_scan_session" cascade;`);
  }

}
