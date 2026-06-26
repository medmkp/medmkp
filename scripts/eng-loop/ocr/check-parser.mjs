#!/usr/bin/env node
// Headless lot/expiry PARSER accuracy harness for the eng-loop OCR playbook.
//
// Runs app/ocrLabel.js `parseLotExpiry` over a ground-truth corpus of raw-OCR-text
// cases (./cases.json) and reports lot/expiry accuracy. This is the OCR analog of
// `products:match --dry-run`: the before/after diff is the snapshot evidence for a
// parser change.
//
// It exercises the PURE text->fields layer — the layer most lot/expiry fixes touch
// — so it's deterministic and needs no browser/Tesseract. The image->text step
// (preprocessing + Tesseract) is verified separately in-browser (see ../playbooks/ocr.md).
//
// Usage:
//   node scripts/eng-loop/ocr/check-parser.mjs           # human report (exit 0)
//   node scripts/eng-loop/ocr/check-parser.mjs --json    # machine-readable summary
//   node scripts/eng-loop/ocr/check-parser.mjs --strict  # exit 1 if any case fails
import { readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const args = new Set(process.argv.slice(2));

// app/ocrLabel.js is ESM inside a CommonJS-typed package; copy to a temp .mjs so
// Node imports it as ESM regardless of the repo's package "type". (No drift: the
// copy is made fresh from the canonical file on every run.)
const tmp = join(tmpdir(), `ocrLabel.${process.pid}.mjs`);
copyFileSync(join(repoRoot, "app", "ocrLabel.js"), tmp);
let parseLotExpiry;
try {
  ({ parseLotExpiry } = await import(pathToFileURL(tmp).href));
} finally {
  rmSync(tmp, { force: true });
}

const cases = JSON.parse(readFileSync(join(here, "cases.json"), "utf8"));
const norm = (v) => (v == null || v === "" ? null : String(v));

let lotOk = 0, lotTotal = 0, expOk = 0, expTotal = 0;
const failures = [];
for (const c of cases) {
  const got = parseLotExpiry(c.text) || {};
  if ("expectLot" in c) {
    lotTotal++;
    if (norm(got.lot) === norm(c.expectLot)) lotOk++;
    else failures.push({ name: c.name, field: "lot", expected: norm(c.expectLot), got: norm(got.lot), text: c.text });
  }
  if ("expectExpiry" in c) {
    expTotal++;
    if (norm(got.expiry) === norm(c.expectExpiry)) expOk++;
    else failures.push({ name: c.name, field: "expiry", expected: norm(c.expectExpiry), got: norm(got.expiry), text: c.text });
  }
}

const pct = (n, d) => (d ? +((100 * n) / d).toFixed(1) : null);
const summary = {
  cases: cases.length,
  lot: { correct: lotOk, total: lotTotal, pct: pct(lotOk, lotTotal) },
  expiry: { correct: expOk, total: expTotal, pct: pct(expOk, expTotal) },
  failures: failures.length,
};

if (args.has("--json")) {
  console.log(JSON.stringify({ ...summary, failureDetail: failures }, null, 2));
} else {
  console.log(`OCR parser accuracy over ${cases.length} cases:`);
  console.log(`  lot:    ${lotOk}/${lotTotal}${summary.lot.pct != null ? ` (${summary.lot.pct}%)` : ""}`);
  console.log(`  expiry: ${expOk}/${expTotal}${summary.expiry.pct != null ? ` (${summary.expiry.pct}%)` : ""}`);
  if (failures.length) {
    console.log(`\n${failures.length} failure(s):`);
    for (const f of failures) {
      console.log(`  [${f.field}] ${f.name}: expected ${JSON.stringify(f.expected)} got ${JSON.stringify(f.got)}`);
      console.log(`         text: ${JSON.stringify(f.text)}`);
    }
  }
}

if (args.has("--strict") && failures.length) process.exit(1);
