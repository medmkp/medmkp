import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260602210945 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_catalog_item" add column if not exists "medusa_product_handle" text not null default '', add column if not exists "canonical_name" text not null default '', add column if not exists "canonical_category" text not null default '';`);
    this.addSql(`alter table if exists "medmkp_catalog_item" alter column "medusa_product_handle" drop default, alter column "canonical_name" drop default, alter column "canonical_category" drop default;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_catalog_item" drop column if exists "medusa_product_handle", drop column if exists "canonical_name", drop column if exists "canonical_category";`);
  }

}
