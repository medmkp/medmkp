import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260602203120 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medmkp_catalog_item" ("id" text not null, "supplier_id" text not null, "sku" text not null, "manufacturer" text not null, "brand" text not null, "name" text not null, "category" text not null, "unit_of_measure" text not null, "unit_price_cents" integer not null, "comparable_score" integer not null, "lead_time_days" integer not null, "inventory_status" text check ("inventory_status" in ('in_stock', 'limited', 'backordered', 'unknown')) not null, "exact_brand_required" boolean not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_catalog_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_catalog_item_deleted_at" ON "medmkp_catalog_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_procurement_request" ("id" text not null, "buyer_name" text not null, "buyer_facility_type" text check ("buyer_facility_type" in ('pt', 'chiro', 'rehab', 'dental', 'cpap', 'other')) not null, "buyer_email" text not null, "status" text check ("status" in ('uploaded', 'reviewing', 'quoted', 'approved', 'ordered', 'fulfilled')) not null, "source_file_name" text not null, "item_count" integer not null, "target_savings_percent" integer not null, "notes" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_procurement_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_procurement_request_deleted_at" ON "medmkp_procurement_request" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_quote" ("id" text not null, "procurement_request_id" text not null, "supplier_id" text not null, "status" text check ("status" in ('draft', 'sent', 'approved', 'rejected', 'expired')) not null, "subtotal_cents" integer not null, "estimated_shipping_cents" integer not null, "platform_fee_cents" integer not null, "estimated_savings_cents" integer not null, "lead_time_days" integer not null, "replacement_policy" text check ("replacement_policy" in ('exact_only', 'buyer_flexible', 'concierge_recommended')) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_quote_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_quote_deleted_at" ON "medmkp_quote" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_supplier" ("id" text not null, "name" text not null, "slug" text not null, "website_url" text not null, "support_email" text not null, "onboarding_status" text check ("onboarding_status" in ('invited', 'in_review', 'approved', 'paused')) not null, "ein_last_four" text not null, "certification_summary" text not null, "default_lead_time_days" integer not null, "ach_enabled" boolean not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_supplier_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_supplier_deleted_at" ON "medmkp_supplier" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medmkp_catalog_item" cascade;`);

    this.addSql(`drop table if exists "medmkp_procurement_request" cascade;`);

    this.addSql(`drop table if exists "medmkp_quote" cascade;`);

    this.addSql(`drop table if exists "medmkp_supplier" cascade;`);
  }

}
