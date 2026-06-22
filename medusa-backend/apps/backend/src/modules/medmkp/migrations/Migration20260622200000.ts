import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Phase 1 spine: two new tables for the TraceDDS inventory model.
//   medmkp_location        — physical places supplies live (per practice)
//   medmkp_inventory_item  — stocked items at a location, with traceability
// Purely additive (create-only, IF NOT EXISTS); no changes to existing tables.
// Btree partial indexes on the equality-filter columns (location.practice_id,
// inventory_item.location_id) match the list-route query patterns + existing
// soft-delete index style; unique index on location.qr_code backs the model's
// .unique() constraint.
export class Migration20260622200000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medmkp_location" ("id" text not null, "practice_id" text not null, "name" text not null, "type" text not null, "qr_code" text not null, "layout_x" numeric null, "layout_y" numeric null, "notes" text null, "created_by" text null, "updated_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_location_pkey" primary key ("id"));`);
    this.addSql(`create unique index if not exists "IDX_medmkp_location_qr_code_unique" on "medmkp_location" ("qr_code") where "deleted_at" is null;`);
    this.addSql(`create index if not exists "IDX_medmkp_location_practice_id" on "medmkp_location" ("practice_id") where "deleted_at" is null;`);

    this.addSql(`create table if not exists "medmkp_inventory_item" ("id" text not null, "location_id" text not null, "canonical_product_id" text null, "supplier_product_id" text null, "name" text not null, "quantity_on_hand" numeric not null default 0, "par_level" numeric null, "shelf_area" text null, "lot_number" text null, "expiration_date" timestamptz null, "package_condition" text null, "photo_url" text null, "last_counted_at" timestamptz null, "counted_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_inventory_item_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "IDX_medmkp_inventory_item_location_id" on "medmkp_inventory_item" ("location_id") where "deleted_at" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medmkp_inventory_item" cascade;`);
    this.addSql(`drop table if exists "medmkp_location" cascade;`);
  }

}
