import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260618170000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "free_shipping_threshold_cents" integer null;`);
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "flat_shipping_cents" integer null;`);
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "shipping_policy_notes" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "free_shipping_threshold_cents";`);
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "flat_shipping_cents";`);
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "shipping_policy_notes";`);
  }

}
