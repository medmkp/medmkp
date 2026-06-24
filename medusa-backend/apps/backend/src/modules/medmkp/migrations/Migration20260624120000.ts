import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Per-line destination location for RECEIVING scans (a delivery fans out to many
// shelves), plus making the session's location nullable (receiving sessions
// aren't tied to one place — location lives on the line). Purely additive.
export class Migration20260624120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_scan_session_line" add column if not exists "location_id" text null;`);
    this.addSql(`alter table if exists "medmkp_scan_session" alter column "location_id" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_scan_session_line" drop column if exists "location_id";`);
    // Intentionally not restoring NOT NULL on medmkp_scan_session.location_id:
    // receiving sessions may now hold null, so re-adding the constraint would fail.
  }

}
