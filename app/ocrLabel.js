// On-device OCR fallback for lot + expiry. When a barcode identifies a product
// but carries no lot/expiry (an HIBC *primary* code, a bare UPC, a GTIN with no
// GS1 secondary), the only place that data exists is the printed text on the
// package. This reads it off a captured camera frame with Tesseract (WASM, runs
// entirely in the browser — nothing is uploaded) and parses out the two fields.
//
// It is deliberately *assistive*: the parsed values are surfaced as a suggestion
// the user confirms before anything is saved. A misread lot feeding a recall
// pull-list is worse than a blank one, so we never auto-commit an OCR guess.

// Three-letter month names, for labels that print "JAN 2026" rather than a
// numeric month. Numeric is the common case; this is cheap insurance.
const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Last calendar day of a month — when a label prints a month-precision expiry
// ("2026-01"), the product is good *through* that month, so we resolve to its
// last day rather than the 1st.
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function isoFrom(year, month, day) {
  if (year < 1990 || year > 2099) return null;
  if (month < 1 || month > 12) return null;
  const d = day || lastDayOfMonth(year, month);
  if (d < 1 || d > 31) return null;
  return `${year}-${pad2(month)}-${pad2(d)}`;
}

// Parse one date-ish token into an ISO `YYYY-MM-DD`, or null. The 4-digit year
// anchors the format, which avoids the MM/DD vs DD/MM ambiguity for the common
// label layouts: a year on the left is Y-M(-D); a year on the right is M(-D)-Y.
export function normalizeExpiry(raw) {
  if (!raw) return null;
  const t = String(raw).trim().toUpperCase().replace(/\s+/g, " ");

  // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  let m = t.match(/\b(20\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/);
  if (m) return isoFrom(+m[1], +m[2], +m[3]);

  // YYYY-MM / YYYY/MM  (month precision → end of month)
  m = t.match(/\b(20\d{2})\s*[-/.]\s*(\d{1,2})\b/);
  if (m) return isoFrom(+m[1], +m[2], 0);

  // MM-DD-YYYY / MM/DD/YYYY
  m = t.match(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(20\d{2})\b/);
  if (m) return isoFrom(+m[3], +m[1], +m[2]);

  // MM-YYYY / MM/YYYY  (month precision → end of month)
  m = t.match(/\b(\d{1,2})\s*[-/.]\s*(20\d{2})\b/);
  if (m) return isoFrom(+m[2], +m[1], 0);

  // MON YYYY / YYYY MON  (3-letter month name, month precision)
  m = t.match(/\b([A-Z]{3})\s*[-/. ]\s*(20\d{2})\b/) || t.match(/\b(20\d{2})\s*[-/. ]\s*([A-Z]{3})\b/);
  if (m) {
    const mon = MONTHS[m[1]] || MONTHS[m[2]];
    const yr = /^\d/.test(m[1]) ? +m[1] : +m[2];
    if (mon) return isoFrom(yr, mon, 0);
  }

  return null;
}

// A bare digit run that's really a date or year, not a lot: a 4-digit year, or a
// YYYYMMDD compact date. Keeps the numeric fallback off dates. 6-digit runs are
// deliberately NOT flagged — a real lot like 260212 reads as a YYMMDD date but is
// a batch number, so we don't want to discard it.
function isDateLikeDigits(d) {
  if (/^(19|20)\d{2}$/.test(d)) return true; // a year on its own
  if (/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(d)) return true; // YYYYMMDD
  return false;
}

// True when a digit run is a self-validating GTIN — a UPC-A (12), EAN-13 (13) or
// GTIN-14 (14) whose trailing GS1 mod-10 check digit holds. The human-readable
// digits printed under a 1D barcode always are one (it's the scanned code spelled
// out); a real numeric lot of that length almost never passes the check, so a
// passing check marks the token as barcode print, not a batch number.
function isGtin(d) {
  if (!/^\d{12,14}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < d.length - 1; i++) {
    const n = d.charCodeAt(d.length - 2 - i) - 48; // data digits, right→left from the check
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10 === d.charCodeAt(d.length - 1) - 48;
}

// Whether two strings name the same scanned code, ignoring formatting and the
// UPC-A↔EAN-13 leading zero (a 12-digit UPC and its 13-digit "0"-padded form are
// one barcode). Used to drop an OCR token that's just the code we already scanned,
// printed as the human-readable line under its bars.
function sameCode(a, b) {
  const norm = (x) => String(x || "").replace(/\D/g, "").replace(/^0+/, "");
  const da = norm(a);
  return da.length >= 6 && da === norm(b);
}

// Find a batch/lot token in OCR text when there's no readable "LOT" marker.
// Conservative on purpose — a wrong lot on a recall pull-list is worse than a
// blank one — so it walks the whitespace tokens in reading order and takes the
// first that has a batch shape and survives every exclusion:
//   • barcode / HIBC / GS1 prints (a token carrying + * $, or a digit run wrapped
//     by GS1 AI parens) are never a lot;
//   • the human-readable digits under a 1D barcode: the code we just scanned
//     (`barcode`), or any self-validating GTIN (a 12–14 digit run whose check
//     digit holds), which is what a UPC/EAN line always is;
//   • catalog / reference / revision numbers (a REF/CAT/MODEL/SKU/REV neighbour,
//     or the dashed xxx-xxxx shape REF numbers print as) are excluded;
//   • bare dates / years are excluded.
// Two accepted shapes: a letter + 5–8 digits (A00626, M607840 — the classic
// stamped batch), and a run of 6–14 bare digits (24015414, 13593092 — the common
// numeric lot; the dash exclusion keeps REF numbers like 112-6830 out).
function findBatchToken(flat, barcode) {
  const tokens = flat.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (/[+*$]/.test(tok)) continue;            // part of a barcode / HIBC string
    if (/[()]/.test(tok)) continue;             // GS1 AI parens, e.g. "17)291019"
    const prev = tokens[i - 1] || "";
    if (/(?:^|\b)(?:REF|REORDER|CAT|CATALOG|MODEL|SKU|REV)\b/.test(prev)) continue;
    if (/^[A-Z]\d{5,8}$/.test(tok)) return tok; // letter + digits stamp (A00626)
    const run = tok.match(/(?:^|[^0-9A-Z])(\d{6,14})(?:$|[^0-9A-Z])/);
    if (run && !isDateLikeDigits(run[1]) && !/\d-\d/.test(tok)) {
      if (barcode && sameCode(run[1], barcode)) continue; // the scanned code's printed line
      if (isGtin(run[1])) continue;                       // any UPC/EAN print, not a lot
      return run[1];
    }
  }
  return undefined;
}

// Pull lot + expiry out of raw OCR text. Returns { lot, expiry, raw } with
// either field possibly undefined — partial reads are useful (a lot with no
// expiry still pre-fills half the form). `barcode` is the code that was scanned
// for this item, if any: its human-readable line is printed right under the bars
// and OCRs as a digit run, so we exclude it from ever becoming the lot.
export function parseLotExpiry(text, { barcode } = {}) {
  const raw = String(text || "");
  // Collapse newlines so a "LOT" label and its value on a wrapped line still
  // associate; the regexes only ever grab the *next* token, so this stays tight.
  const flat = raw.toUpperCase().replace(/\s+/g, " ").trim();

  let lot;
  // LOT [NO|NUMBER|#] <value>. Keyword-anchored is the precise path; tolerate the
  // usual garbles of the three letters (L0T, LDT, LOI) AND the boxed "LOT" marker
  // on medical labels: its frame OCRs as bracket/pipe junk glued to the value, so
  // Tesseract reads "[LoT]|260212" or "LOT] 24015414". The separator between the
  // marker and the value therefore allows those box glyphs, not just spaces and
  // colons. Value allows common batch separators (A-219, 13593092, M607840).
  const lotMatch = flat.match(
    /\bL[O0D][T1I]\b[\s.:#)\]\[|]*(?:N[O0]\.?|NUMBER)?[\s.:#)\]\[|]*([A-Z0-9][A-Z0-9\-/]{2,19})/,
  );
  if (
    lotMatch &&
    !/^(?:N[O0]|NUMBER|NUM)$/.test(lotMatch[1]) &&
    !(barcode && sameCode(lotMatch[1], barcode)) // not the scanned code mis-tagged as LOT
  ) {
    lot = lotMatch[1];
  } else {
    // No usable "LOT" marker — the box edges defeated the classifier entirely (on
    // a real Patterson label "LOT" read as "[ETI"), or the batch is printed bare.
    // Fall back to a batch-number SHAPE among the tokens. See findBatchToken.
    lot = findBatchToken(flat, barcode);
  }

  let expiry;
  // Prefer a keyword-tagged date (EXP / USE BY / BEST BEFORE), which is
  // unambiguous — trusted even if it's in the past, since an expired item on the
  // shelf is exactly what we want to surface.
  const expKw = flat.match(/\b(?:EXP(?:IR(?:Y|ES|ATION))?|USE BY|BEST BEFORE|BB)\b[\s:.]*([0-9A-Z][0-9A-Z\-/. ]{4,11})/);
  if (expKw) expiry = normalizeExpiry(expKw[1]);
  if (!expiry) {
    // No keyword (many labels mark expiry only with the ISO hourglass symbol,
    // which OCR can't read). Fall back to a bare date — but tightened, because a
    // wrong expiry is worse than a blank one. Drop dates tagged as manufacture or
    // revision (REV/REV2/REVISED, MFG/MFD/MANUF, MADE — not expiries), then take
    // the LATEST of what's left: the expiry is always the latest date on a label,
    // so max() keeps a stray earlier print/mfg date from winning when neither
    // carries a keyword (e.g. a glove box's manufacture date next to its expiry).
    const candidates = [];
    let prevEnd = 0; // end of the last date seen — the marker window never crosses
    // it, so an earlier date's "MFG" tag can't leak onto the next date.
    for (const m of flat.matchAll(/\b\d[\d\-/. ]{4,11}\d\b|\b[A-Z]{3}[-/. ]20\d{2}\b|\b20\d{2}[-/. ][A-Z]{3}\b/g)) {
      const iso = normalizeExpiry(m[0]);
      if (!iso) continue;
      const before = flat.slice(Math.max(prevEnd, m.index - 14), m.index);
      prevEnd = m.index + m[0].length;
      if (/\b(?:REV|MFG|MFD|MANUF|MADE)/.test(before)) continue;
      candidates.push(iso);
    }
    if (candidates.length) expiry = candidates.sort()[candidates.length - 1];
  }

  return { lot, expiry, raw };
}

// ── Browser OCR engine ────────────────────────────────────────────────

// One lazy import of Tesseract (the WASM core + the quantized LSTM English model
// are ~5.5 MB combined, fetched once from the jsDelivr CDN and then cached by the
// browser) and one worker built from it — never pay that twice. Lazy so none of
// it touches the initial bundle (same pattern as the @zxing QR writer).
let modulePromise = null;
let workerPromise = null;
function getModule() {
  if (!modulePromise) modulePromise = import("tesseract.js");
  return modulePromise;
}

// First-load progress, broadcast to any UI that wants to show a one-time
// "preparing the reader" bar while those ~5.5 MB download. The worker is built
// once, so this fires once per page; on a return visit the assets come from cache
// and it completes near-instantly (the UI debounces so the bar never flashes).
let loadState = { phase: "idle", progress: 0 }; // idle | loading | ready
const loadListeners = new Set();
function setLoad(next) {
  loadState = { ...loadState, ...next };
  for (const fn of loadListeners) fn(loadState);
}
// Subscribe to load progress; replays the current state immediately. Returns an
// unsubscribe.
export function onOcrLoad(fn) {
  loadListeners.add(fn);
  fn(loadState);
  return () => loadListeners.delete(fn);
}

// Tesseract reports each load step with its own 0..1 progress; weight the steps
// into one forward-only bar. The per-scan "recognizing text" step isn't a
// download, so it's left out of the load bar.
const LOAD_STAGES = {
  "loading tesseract core": [0, 0.45],
  "loading language traineddata": [0.45, 0.9],
  "initializing tesseract": [0.9, 0.97],
  "initializing api": [0.97, 1],
};
function logger(m) {
  const stage = LOAD_STAGES[m.status];
  if (!stage) return;
  const p = stage[0] + (stage[1] - stage[0]) * (m.progress || 0);
  if (p > loadState.progress) setLoad({ phase: "loading", progress: p });
}

function getWorker() {
  if (!workerPromise) {
    // oem is left at its default (LSTM_ONLY) — the small LSTM core + the quantized
    // model. The logger drives the load bar above.
    workerPromise = getModule()
      .then(({ createWorker }) => createWorker("eng", undefined, { logger }))
      .then((w) => { setLoad({ phase: "ready", progress: 1 }); return w; });
  }
  return workerPromise;
}

// Pre-warm the reader (kick off the one-time core + model download) before it's
// needed — called when the scanner camera opens so the first label read isn't
// blocked on the download. Safe to call repeatedly; the worker is built once.
export function warmOcr() {
  getWorker().catch(() => {});
}

// Grayscale + per-frame contrast-stretch the captured frame onto a fresh canvas.
// Medical labels print dark text on saturated foil/colour (Patterson's gold
// suture labels, Pulpdent's boxed markers); Tesseract reads the luma far more
// reliably than the raw colour frame, and stretching the actual tonal range to
// full black/white rescues low-contrast foil. Small crops are upscaled — the
// recogniser wants tall glyphs. Best-effort: returns the source untouched if the
// frame can't be read back (e.g. a tainted canvas, or no DOM).
function preprocess(source) {
  const sw = source.width || source.videoWidth || 0;
  const sh = source.height || source.videoHeight || 0;
  if (!sw || !sh || typeof document === "undefined") return source;
  const minSide = Math.min(sw, sh);
  const scale = minSide < 800 ? Math.min(2, 1200 / minSide) : 1;
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, w, h);
  let image;
  try { image = ctx.getImageData(0, 0, w, h); } catch { return canvas; }
  const px = image.data;
  // Pass 1: luma, plus a histogram of the result.
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    px[i] = px[i + 1] = px[i + 2] = g;
    hist[g]++;
  }
  // Pass 2: stretch the 0.5–99.5 percentile band to [0,255] (percentiles, not
  // min/max, so a glare highlight or a dark edge doesn't flatten the stretch).
  const cut = (px.length / 4) * 0.005;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= cut) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= cut) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    let v = ((px[i] - lo) * 255) / span;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Run OCR on a captured frame (a canvas / ImageBitmap / blob) and return the
// parsed { lot, expiry }. Resolves to {} on any failure — OCR is best-effort and
// the user can always type the values in.
//
// Two page-segmentation passes, because no single mode reads every label:
// SPARSE_TEXT ("find text anywhere, ignore layout") nails labels whose lot/expiry
// sit next to a 2D barcode — the layout-aware modes treat that row as an image
// and drop it — while AUTO recovers low-contrast foil that sparse mode misses
// entirely. Run sparse first, only fall back to AUTO for a field it didn't get,
// then keep each field from whichever pass found it.
export async function ocrLotExpiry(source, { barcode } = {}) {
  if (!source) return {};
  try {
    const [{ PSM }, worker] = await Promise.all([getModule(), getWorker()]);
    const image = preprocess(source);
    const read = async (psm) => {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      const { data } = await worker.recognize(image);
      return parseLotExpiry(data?.text || "", { barcode });
    };
    let { lot, expiry } = await read(PSM.SPARSE_TEXT);
    if (!lot || !expiry) {
      const more = await read(PSM.AUTO);
      lot = lot || more.lot;
      expiry = expiry || more.expiry;
    }
    return { lot, expiry };
  } catch {
    return {};
  }
}
