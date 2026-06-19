import { model } from "@medusajs/framework/utils"

// One queued request to build a cart at a supplier for a practice. The backend
// enqueues a row (status "queued"); the NUC-side Playwright runner claims it
// (→ "running"), logs in, adds each line, and writes the outcome back
// (→ "done"/"failed"). The frontend cart drawer polls this row for live status.
//
// `lines` is the snapshot of what to add: [{ name, qty, productUrl, sku }].
// `results` is the per-line outcome the runner writes:
//   [{ productUrl, status: "added"|"out_of_stock"|"not_found"|"failed", note }].
const CartBuildJob = model.define("medmkp_cart_build_job", {
  id: model.id({ prefix: "cbj" }).primaryKey(),
  practice_id: model.text(),
  supplier_id: model.text(),
  supplier_slug: model.text(),
  status: model
    .enum(["queued", "running", "done", "failed", "needs_auth"])
    .default("queued"),
  lines: model.json(),
  results: model.json().nullable(),
  // Where the buyer opens their now-populated cart (the supplier's cart URL).
  cart_url: model.text().nullable(),
  error: model.text().nullable(),
  // Set when the runner claims the job, so a crashed runner's stale "running"
  // rows can be reaped instead of blocking the queue forever.
  claimed_at: model.dateTime().nullable(),
  finished_at: model.dateTime().nullable(),
})

export default CartBuildJob
