import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260618140000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_dental_practice" add column if not exists "ship_address_line1" text null;`);
    this.addSql(`alter table if exists "medmkp_dental_practice" add column if not exists "ship_address_line2" text null;`);
    this.addSql(`alter table if exists "medmkp_dental_practice" add column if not exists "ship_city" text null;`);
    this.addSql(`alter table if exists "medmkp_dental_practice" add column if not exists "ship_state" text null;`);
    this.addSql(`alter table if exists "medmkp_dental_practice" add column if not exists "ship_zip" text null;`);
    this.addSql(`alter table if exists "medmkp_dental_practice" add column if not exists "ship_country" text null;`);
    this.addSql(`alter table if exists "medmkp_dental_practice" add column if not exists "shipping_notes" text null;`);
    this.addSql(`alter table if exists "medmkp_dental_practice" add column if not exists "use_as_billing" boolean not null default false;`);
    this.addSql(`alter table if exists "medmkp_dental_practice" add column if not exists "preferences" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_dental_practice" drop column if exists "ship_address_line1";`);
    this.addSql(`alter table if exists "medmkp_dental_practice" drop column if exists "ship_address_line2";`);
    this.addSql(`alter table if exists "medmkp_dental_practice" drop column if exists "ship_city";`);
    this.addSql(`alter table if exists "medmkp_dental_practice" drop column if exists "ship_state";`);
    this.addSql(`alter table if exists "medmkp_dental_practice" drop column if exists "ship_zip";`);
    this.addSql(`alter table if exists "medmkp_dental_practice" drop column if exists "ship_country";`);
    this.addSql(`alter table if exists "medmkp_dental_practice" drop column if exists "shipping_notes";`);
    this.addSql(`alter table if exists "medmkp_dental_practice" drop column if exists "use_as_billing";`);
    this.addSql(`alter table if exists "medmkp_dental_practice" drop column if exists "preferences";`);
  }

}
