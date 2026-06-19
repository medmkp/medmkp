#!/usr/bin/env node
// MedMKP headless buying agent — runs on the home NUC.
//
// Loops: claim a queued cart-build job from the backend, drive a headless
// browser to log into the supplier and add each line to the cart, then report
// per-line results + the cart URL back. The buyer then opens the supplier,
// logs in themselves, and finds the cart already populated.
//
// Usage:
//   MEDMKP_BACKEND_URL=https://… CART_AGENT_TOKEN=… node runner.mjs        # daemon
//   node runner.mjs --once    # process at most one job then exit (for cron)
//
// Env:
//   MEDMKP_BACKEND_URL  backend base (e.g. https://medmkp-medusa.onrender.com)
//   CART_AGENT_TOKEN    shared secret matching the backend's CART_AGENT_TOKEN
//   CART_AGENT_HEADFUL  set to "1" to watch the browser (debugging)
//   CART_AGENT_POLL_MS  idle poll interval (default 15000)

import { chromium } from "playwright";
import { claimJob, reportResult } from "./backend.mjs";
import { adapterFor } from "./suppliers/index.mjs";

const ONCE = process.argv.includes("--once");
const POLL_MS = Number(process.env.CART_AGENT_POLL_MS || 15000);

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function runJob(job) {
  const adapter = adapterFor(job.supplier_slug);
  if (!adapter) {
    log(`job ${job.id}: no adapter for "${job.supplier_slug}"`);
    await reportResult({
      job_id: job.id,
      status: "failed",
      error: `No buying-agent adapter for supplier "${job.supplier_slug}".`,
    });
    return;
  }

  const browser = await chromium.launch({
    headless: process.env.CART_AGENT_HEADFUL !== "1",
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await adapter.login(page, job.credential);

    const results = [];
    for (const line of job.lines) {
      try {
        const r = await adapter.addLine(page, line);
        results.push({ productUrl: line.productUrl, status: r.status, note: r.note || "" });
        log(`job ${job.id}: ${r.status} — ${line.name || line.productUrl}`);
      } catch (err) {
        results.push({
          productUrl: line.productUrl,
          status: "failed",
          note: String(err?.message || err).slice(0, 200),
        });
      }
    }

    const anyAdded = results.some((r) => r.status === "added");
    await reportResult({
      job_id: job.id,
      status: "done",
      results,
      cart_url: anyAdded ? adapter.cartUrl : null,
      credential_status: "ok",
    });
  } catch (err) {
    const authFailed = err?.code === "auth_failed";
    log(`job ${job.id}: ${authFailed ? "auth failed" : "error"} — ${err?.message || err}`);
    await reportResult({
      job_id: job.id,
      status: authFailed ? "needs_auth" : "failed",
      error: String(err?.message || err).slice(0, 300),
      credential_status: authFailed ? "auth_failed" : "error",
    });
  } finally {
    await browser.close().catch(() => {});
  }
}

async function tick() {
  const job = await claimJob();
  if (!job) return false;
  log(`claimed job ${job.id} (${job.supplier_slug}, ${job.lines.length} lines)`);
  await runJob(job);
  return true;
}

async function main() {
  log(`cart-agent starting (${ONCE ? "once" : "daemon"})`);
  for (;;) {
    let worked = false;
    try {
      worked = await tick();
    } catch (err) {
      log("tick error:", err?.message || err);
    }
    if (ONCE) break;
    // Drain the queue back-to-back; only sleep when it's empty.
    if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  log("fatal:", err?.message || err);
  process.exit(1);
});
