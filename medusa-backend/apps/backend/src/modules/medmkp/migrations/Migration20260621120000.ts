import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260621120000 extends Migration {

  override async up(): Promise<void> {
    // Tiered flat rate (e.g. Darby $13.95 under $150 / $10.95 at $150+).
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "shipping_flat_tiers" jsonb null;`);
    // Layer 1: published delivery promise (stated ground transit window + cutoff).
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "transit_days_min" integer null;`);
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "transit_days_max" integer null;`);
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "order_cutoff_local" text null;`);
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "ships_same_day" boolean null;`);
    // Layer 2: distribution-center origins for per-destination ground estimation.
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "dist_center_zips" text null;`);
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "ship_carrier" text null;`);
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "shipping_time_notes" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "shipping_flat_tiers";`);
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "transit_days_min";`);
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "transit_days_max";`);
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "order_cutoff_local";`);
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "ships_same_day";`);
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "dist_center_zips";`);
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "ship_carrier";`);
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "shipping_time_notes";`);
  }

}
