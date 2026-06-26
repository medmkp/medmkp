import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Remove the scan SESSION concept: every scan now lands directly as a
// lot-at-location evidence record (medmkp_inventory_item), so the resumable
// session container and its draft line rows are gone. Additive columns on
// inventory_item carry what those line rows used to: `barcode` (so an
// unidentified scan can be filed + deduped by barcode-at-location, then linked
// later) and `received_date` (when a receiving scan logged the delivery).
//
// Dropping the session tables loses no evidence — inventory rows were written on
// each scan independently, never on session completion.
export class Migration20260625120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_inventory_item" add column if not exists "barcode" text null;`);
    this.addSql(`alter table if exists "medmkp_inventory_item" add column if not exists "received_date" timestamptz null;`);
    this.addSql(`drop table if exists "medmkp_scan_session_line" cascade;`);
    this.addSql(`drop table if exists "medmkp_scan_session" cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_inventory_item" drop column if exists "barcode";`);
    this.addSql(`alter table if exists "medmkp_inventory_item" drop column if exists "received_date";`);
    // The scan_session tables are intentionally not recreated on down: they held
    // transient draft state, the app no longer reads or writes them, and the
    // durable evidence (inventory_item) is unaffected by their absence.
  }

}
