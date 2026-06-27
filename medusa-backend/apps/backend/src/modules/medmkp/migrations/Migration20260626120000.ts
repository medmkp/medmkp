import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Durable product URLs across re-match runs.
//
// Auto-generated canonical product ids/handles used to embed a positional
// cluster index, so every catalog re-match reshuffled them: a product's handle
// changed and the freed id was recycled onto an unrelated product, breaking every
// previously-issued URL (bookmarks, open tabs, saved lists, shared links) with
// "Product not found". The matcher now derives ids/handles from a content hash so
// they stay stable, and this alias table preserves any handle that was ever live
// — including the one-time switch from the old positional scheme — by mapping it
// to the canonical product that superseded it. The canonical-products route falls
// back to this table when a handle lookup misses, so stale URLs keep resolving.
//
// Not a Medusa-managed model: it is written by the matcher (raw SQL, ON CONFLICT)
// and read by the store route via the shared pg pool. Handle is the primary key,
// which gives the unique constraint the matcher's upsert depends on.
export class Migration20260626120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medmkp_canonical_handle_alias" (
      "handle" text not null,
      "canonical_id" text not null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "medmkp_canonical_handle_alias_pkey" primary key ("handle")
    );`);
    this.addSql(`create index if not exists "IDX_medmkp_canonical_handle_alias_canonical_id" on "medmkp_canonical_handle_alias" ("canonical_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medmkp_canonical_handle_alias";`);
  }

}
