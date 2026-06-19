import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260619170000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medmkp_supplier_credential" (
      "id" text not null,
      "practice_id" text not null,
      "supplier_id" text not null,
      "username" text not null,
      "username_hint" text not null,
      "password_encrypted" text not null,
      "last_verified_at" timestamptz null,
      "last_status" text not null default 'unverified',
      "last_error" text null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "medmkp_supplier_credential_pkey" primary key ("id")
    );`);
    this.addSql(`create unique index if not exists "IDX_supplier_credential_practice_supplier" on "medmkp_supplier_credential" ("practice_id", "supplier_id") where "deleted_at" is null;`);

    this.addSql(`create table if not exists "medmkp_cart_build_job" (
      "id" text not null,
      "practice_id" text not null,
      "supplier_id" text not null,
      "supplier_slug" text not null,
      "status" text not null default 'queued',
      "lines" jsonb not null,
      "results" jsonb null,
      "cart_url" text null,
      "error" text null,
      "claimed_at" timestamptz null,
      "finished_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "medmkp_cart_build_job_pkey" primary key ("id")
    );`);
    this.addSql(`create index if not exists "IDX_cart_build_job_status" on "medmkp_cart_build_job" ("status") where "deleted_at" is null;`);
    this.addSql(`create index if not exists "IDX_cart_build_job_practice" on "medmkp_cart_build_job" ("practice_id") where "deleted_at" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medmkp_supplier_credential" cascade;`);
    this.addSql(`drop table if exists "medmkp_cart_build_job" cascade;`);
  }

}
