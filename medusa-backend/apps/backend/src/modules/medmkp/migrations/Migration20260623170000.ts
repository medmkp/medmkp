import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Three new columns on scan_session_line for the three scan modes:
//   supplier_name       — receiving mode: which supplier shipped this lot
//   received_date       — receiving mode: when the shipment arrived (defaults to today in FE)
//   shelf_audit_status  — shelf audit mode: present | moved | not_found | removed
// Purely additive (IF NOT EXISTS), existing rows unaffected.
export class Migration20260623170000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_scan_session_line" add column if not exists "supplier_name" text null;`);
    this.addSql(`alter table if exists "medmkp_scan_session_line" add column if not exists "received_date" timestamptz null;`);
    this.addSql(`alter table if exists "medmkp_scan_session_line" add column if not exists "shelf_audit_status" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_scan_session_line" drop column if exists "supplier_name";`);
    this.addSql(`alter table if exists "medmkp_scan_session_line" drop column if exists "received_date";`);
    this.addSql(`alter table if exists "medmkp_scan_session_line" drop column if exists "shelf_audit_status";`);
  }

}
