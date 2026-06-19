import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260618160000 extends Migration {

  override async up(): Promise<void> {
    // Display-only variant families: group size/spec variants under one
    // browsable product. Populated by the canonical matcher (products:match).
    this.addSql(`alter table if exists "medmkp_canonical_product" add column if not exists "family_id" text null;`);
    this.addSql(`alter table if exists "medmkp_canonical_product" add column if not exists "family_handle" text null;`);
    this.addSql(`alter table if exists "medmkp_canonical_product" add column if not exists "family_name" text null;`);
    this.addSql(`alter table if exists "medmkp_canonical_product" add column if not exists "variant_label" text null;`);
    this.addSql(`alter table if exists "medmkp_canonical_product" add column if not exists "variant_rank" integer null;`);
    // Group listing by family and resolve a family page by handle.
    this.addSql(`create index if not exists "IDX_medmkp_canonical_product_family_id" on "medmkp_canonical_product" ("family_id");`);
    this.addSql(`create index if not exists "IDX_medmkp_canonical_product_family_handle" on "medmkp_canonical_product" ("family_handle");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_medmkp_canonical_product_family_id";`);
    this.addSql(`drop index if exists "IDX_medmkp_canonical_product_family_handle";`);
    this.addSql(`alter table if exists "medmkp_canonical_product" drop column if exists "family_id";`);
    this.addSql(`alter table if exists "medmkp_canonical_product" drop column if exists "family_handle";`);
    this.addSql(`alter table if exists "medmkp_canonical_product" drop column if exists "family_name";`);
    this.addSql(`alter table if exists "medmkp_canonical_product" drop column if exists "variant_label";`);
    this.addSql(`alter table if exists "medmkp_canonical_product" drop column if exists "variant_rank";`);
  }

}
