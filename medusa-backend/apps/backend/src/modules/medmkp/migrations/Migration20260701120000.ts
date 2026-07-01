import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Billing schema for Stripe — ships dark (nothing reads these yet).
//
// Additive + backward-compatible ALTER of the existing (already-migrated)
// medmkp_practice_subscription table plus one small new idempotency table.
// Hand-written because `medusa db:generate` can't run in this environment and
// its snapshot has drifted; every statement is IF [NOT] EXISTS / DROP-then-ADD
// so the whole migration is a no-op on re-run.
//
//   - Widen `status` to the full Stripe subscription-status set (the original
//     four values are preserved) by swapping the check constraint in place — no
//     column type change, no table rewrite.
//   - Add nullable `last_reconciled_at` for reconcile-on-return logic.
//   - One-to-one guards: unique `stripe_customer_id`, `stripe_subscription_id`,
//     and one live subscription row per `practice_id`. Partial (deleted_at is
//     null) to match Medusa's soft-delete `.unique()` convention.
//   - New `medmkp_processed_webhook_event` ledger with a unique Stripe
//     `event_id` for idempotent webhook handling.
export class Migration20260701120000 extends Migration {

  override async up(): Promise<void> {
    // Widen the status enum in place (keeps the original four values).
    this.addSql(`alter table if exists "medmkp_practice_subscription" drop constraint if exists "medmkp_practice_subscription_status_check";`);
    this.addSql(`alter table if exists "medmkp_practice_subscription" add constraint "medmkp_practice_subscription_status_check" check ("status" in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'unpaid', 'paused', 'canceled'));`);

    // Reconcile-on-return timestamp (nullable).
    this.addSql(`alter table if exists "medmkp_practice_subscription" add column if not exists "last_reconciled_at" timestamptz null;`);

    // One-to-one / one-per-practice uniqueness guards (soft-delete aware).
    this.addSql(`create unique index if not exists "IDX_medmkp_practice_subscription_practice_id_unique" on "medmkp_practice_subscription" ("practice_id") where "deleted_at" is null;`);
    this.addSql(`create unique index if not exists "IDX_medmkp_practice_subscription_stripe_customer_id_unique" on "medmkp_practice_subscription" ("stripe_customer_id") where "deleted_at" is null;`);
    this.addSql(`create unique index if not exists "IDX_medmkp_practice_subscription_stripe_subscription_id_unique" on "medmkp_practice_subscription" ("stripe_subscription_id") where "deleted_at" is null;`);

    // Idempotent-webhook ledger.
    this.addSql(`create table if not exists "medmkp_processed_webhook_event" ("id" text not null, "event_id" text not null, "type" text not null, "processed_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_processed_webhook_event_pkey" primary key ("id"));`);
    this.addSql(`create unique index if not exists "IDX_medmkp_processed_webhook_event_event_id_unique" on "medmkp_processed_webhook_event" ("event_id") where "deleted_at" is null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_processed_webhook_event_deleted_at" ON "medmkp_processed_webhook_event" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medmkp_processed_webhook_event" cascade;`);

    this.addSql(`drop index if exists "IDX_medmkp_practice_subscription_practice_id_unique";`);
    this.addSql(`drop index if exists "IDX_medmkp_practice_subscription_stripe_customer_id_unique";`);
    this.addSql(`drop index if exists "IDX_medmkp_practice_subscription_stripe_subscription_id_unique";`);

    this.addSql(`alter table if exists "medmkp_practice_subscription" drop column if exists "last_reconciled_at";`);

    // Restore the original narrow status check constraint.
    this.addSql(`alter table if exists "medmkp_practice_subscription" drop constraint if exists "medmkp_practice_subscription_status_check";`);
    this.addSql(`alter table if exists "medmkp_practice_subscription" add constraint "medmkp_practice_subscription_status_check" check ("status" in ('trialing', 'active', 'past_due', 'canceled'));`);
  }

}
