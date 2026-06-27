import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Evidence Library document metadata foundation. This is intentionally
// metadata-only: file bytes live in object storage and `storage_key` is the
// placeholder used to resolve a presigned URL later.
export class Migration20260627120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medmkp_evidence_document" (
      "id" text not null,
      "practice_id" text not null,
      "document_type" text check ("document_type" in ('sds', 'ifu', 'expiration', 'lot', 'service', 'price', 'waterline', 'other')) not null,
      "status" text check ("status" in ('missing', 'captured', 'partial', 'verified', 'rejected', 'archived')) not null default 'captured',
      "file_name" text null,
      "file_mime_type" text null,
      "file_extension" text null,
      "file_size_bytes" numeric null,
      "storage_key" text null,
      "source" text null,
      "inventory_item_id" text null,
      "canonical_product_id" text null,
      "supplier_id" text null,
      "supplier_product_id" text null,
      "location_id" text null,
      "lot_number" text null,
      "expiration_date" timestamptz null,
      "review_due_at" timestamptz null,
      "reviewed_at" timestamptz null,
      "reviewed_by" text null,
      "review_note" text null,
      "notes" text null,
      "created_by" text null,
      "updated_by" text null,
      "uploaded_by" text null,
      "uploaded_at" timestamptz null,
      "deleted_by" text null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "medmkp_evidence_document_pkey" primary key ("id")
    );`);
    this.addSql(`create index if not exists "IDX_medmkp_evidence_document_practice_status" on "medmkp_evidence_document" ("practice_id", "status") where deleted_at is null;`);
    this.addSql(`create index if not exists "IDX_medmkp_evidence_document_type" on "medmkp_evidence_document" ("document_type") where deleted_at is null;`);
    this.addSql(`create index if not exists "IDX_medmkp_evidence_document_inventory_item_id" on "medmkp_evidence_document" ("inventory_item_id") where deleted_at is null;`);
    this.addSql(`create index if not exists "IDX_medmkp_evidence_document_canonical_product_id" on "medmkp_evidence_document" ("canonical_product_id") where deleted_at is null;`);
    this.addSql(`create index if not exists "IDX_medmkp_evidence_document_supplier_id" on "medmkp_evidence_document" ("supplier_id") where deleted_at is null;`);
    this.addSql(`create index if not exists "IDX_medmkp_evidence_document_supplier_product_id" on "medmkp_evidence_document" ("supplier_product_id") where deleted_at is null;`);
    this.addSql(`create index if not exists "IDX_medmkp_evidence_document_location_id" on "medmkp_evidence_document" ("location_id") where deleted_at is null;`);
    this.addSql(`create index if not exists "IDX_medmkp_evidence_document_review_due_at" on "medmkp_evidence_document" ("review_due_at") where deleted_at is null;`);
    this.addSql(`create index if not exists "IDX_medmkp_evidence_document_deleted_at" on "medmkp_evidence_document" ("deleted_at") where deleted_at is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medmkp_evidence_document";`);
  }

}
