import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260604120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medmkp_canonical_product" ("id" text not null, "handle" text not null, "name" text not null, "category" text not null, "description" text not null, "unit_of_measure" text not null, "attributes_text" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_canonical_product_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_canonical_product_deleted_at" ON "medmkp_canonical_product" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_supplier_product" ("id" text not null, "supplier_id" text not null, "source_catalog" text not null, "source_page" integer not null, "source_section" text not null, "source_group_name" text not null, "source_variant" text not null, "sku" text not null, "name" text not null, "description" text not null, "category" text not null, "subcategory" text not null, "product_line" text not null, "features_text" text not null, "raw_text" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_supplier_product_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_supplier_product_deleted_at" ON "medmkp_supplier_product" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_canonical_product_match" ("id" text not null, "canonical_product_id" text not null, "supplier_product_id" text not null, "supplier_id" text not null, "match_status" text check ("match_status" in ('exact', 'variant', 'substitute', 'needs_review', 'unmatched')) not null, "confidence_score" integer not null, "match_reason" text not null, "extracted_attributes_text" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_canonical_product_match_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_canonical_product_match_deleted_at" ON "medmkp_canonical_product_match" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medmkp_canonical_product_match" cascade;`);
    this.addSql(`drop table if exists "medmkp_supplier_product" cascade;`);
    this.addSql(`drop table if exists "medmkp_canonical_product" cascade;`);
  }

}
