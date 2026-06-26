### Playbook: OCR lot/expiry quality (label reading)

Goal: improve how the scanner reads **lot** and **expiry** off real dental-supply
labels, verified by an **accuracy diff** on a ground-truth corpus. The parser lives
in `app/ocrLabel.js` (`parseLotExpiry`/`normalizeExpiry` = pure text→fields;
`ocrLotExpiry` = browser Tesseract.js + grayscale/contrast/dual-PSM preprocessing).

**Two layers — fix whichever a real label exposes:**
- **Parser** (text→fields): OCR-garble tolerance, lot keyword/shape, date formats.
  Deterministic, headless, the durable regression layer.
- **Image→text** (preprocessing + Tesseract): contrast, scale, rotation, page-seg.
  Verified in-browser via the running app.

**Hard rules:** lot/expiry are **assistive suggestions only** — never change that
(no auto-commit of read values). Keep diffs minimal. The Tesseract English model is
auto-fetched in-browser, so no asset setup is needed for the image path.

#### 1. Baseline (BEFORE)
```
node scripts/eng-loop/ocr/check-parser.mjs --json
```
This runs `parseLotExpiry` over `scripts/eng-loop/ocr/cases.json` (raw-OCR-text →
expected lot/expiry) and prints accuracy. Record it.

#### 2. Get a real failing case — prefer labels found on the internet
- **Source real labels** with the `/browse` skill: marketplace listing photos are the
  best source of boxes showing real LOT/EXP (e.g. eBay `s-l*.jpg`), plus image search
  for "<dental product> lot expiration label", and GUDID package images. Also use the
  local corpus: `test/barcodes/Good-Bad-Scans/`, `test/barcodes/patterson-suture-label.jpg`.
- **Establish ground truth yourself:** read the lot/expiry off the image **by eye**
  (you are multimodal) — that is the gold label. Don't trust a source's text blindly.
- **Run the real pipeline** on the image: bring up the app (`npm run dev`) and exercise
  the production `ocrLotExpiry` through the running app in the headless browser (a small
  throwaway harness page that imports `ocrLotExpiry` and prints `{lot,expiry}` + the raw
  OCR text is fine — do **not** commit it). Compare extracted vs your ground truth.

#### 3. Fix one defect
- **If the raw OCR text was right but parsing was wrong** → fix `parseLotExpiry`/
  `normalizeExpiry`, and **add the real raw OCR text as a new case** in `cases.json`
  with your ground-truth lot/expiry. This converts the failure into a permanent,
  headless regression test.
- **If the image OCR'd to garbage** (preprocessing/Tesseract) → improve the
  preprocessing/PSM in `ocrLabel.js`; verify the same image now reads correctly
  in-browser (before/after extraction is your evidence).
- Keep it surgical — one defect per run. Don't regress existing `cases.json`.

#### 4. Verify (AFTER) — the snapshot
- `node scripts/eng-loop/ocr/check-parser.mjs` → all cases (including the new one) pass,
  and the before→after accuracy numbers are the PR evidence.
- For a preprocessing fix, also include the in-browser before/after extraction (screenshot
  or the printed `{lot,expiry}`) for the specific label.

#### 5. Open the PR
- Commit the `ocrLabel.js` change **and** the new `cases.json` entry (and, if small and
  license-safe, the label image under `test/`). PR "Verification" = the accuracy
  before→after table from `check-parser.mjs` plus, for preprocessing, the in-browser
  read. No evidence → no PR.

#### If nothing fails
- If sampled labels all read correctly, a quiet tick is fine. Optionally still commit a
  PR that just **adds new green cases** from real internet labels (growing the regression
  corpus is a real improvement) — the accuracy table (now over more cases) is the evidence.
