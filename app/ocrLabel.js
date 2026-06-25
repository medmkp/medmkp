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

// Pull lot + expiry out of raw OCR text. Returns { lot, expiry, raw } with
// either field possibly undefined — partial reads are useful (a lot with no
// expiry still pre-fills half the form).
export function parseLotExpiry(text) {
  const raw = String(text || "");
  // Collapse newlines so a "LOT" label and its value on a wrapped line still
  // associate; the regexes only ever grab the *next* token, so this stays tight.
  const flat = raw.toUpperCase().replace(/\s+/g, " ").trim();

  let lot;
  // LOT [NO|NUMBER|#] <value>. Keyword-anchored is the precise path; tolerate
  // the usual OCR garbles of the three letters (L0T, LDT, LOI). Allow common
  // batch separators inside the value (A-219, 13593092, M607840).
  const lotMatch = flat.match(/\bL[O0D][T1I]\b\s*(?:NO\.?|NUMBER|#|:)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-/]{2,19})/);
  if (lotMatch && !/^(?:NO|NUMBER|NUM)$/.test(lotMatch[1])) {
    lot = lotMatch[1];
  } else {
    // Fallback for when OCR mangles the boxed "LOT" marker entirely (the box
    // edges confuse the classifier — on a real Patterson label "LOT" read as
    // "[ETI"). A letter followed by 5–8 digits (M607840) is a distinctive
    // batch-number shape that rarely collides with other label tokens; we skip
    // it when it's clearly a catalog/reference number instead.
    const shape = flat.match(/\b([A-Z]\d{5,8})\b/);
    const before = shape ? flat.slice(Math.max(0, shape.index - 14), shape.index) : "";
    if (shape && !/\b(?:REF|REORDER|CAT|CATALOG|MODEL|SKU)\b/.test(before)) lot = shape[1];
  }

  let expiry;
  // Prefer a keyword-tagged date (EXP / USE BY / BEST BEFORE), which is
  // unambiguous. Fall back to the most plausible bare date token on the label —
  // many medical labels mark expiry only with the ISO hourglass symbol, which
  // OCR can't read, leaving just the date.
  const expKw = flat.match(/\b(?:EXP(?:IR(?:Y|ES|ATION))?|USE BY|BEST BEFORE|BB)\b[\s:.]*([0-9A-Z][0-9A-Z\-/. ]{4,11})/);
  if (expKw) expiry = normalizeExpiry(expKw[1]);
  if (!expiry) {
    for (const tok of flat.match(/\b\d[\d\-/. ]{4,11}\d\b|\b[A-Z]{3}[-/. ]20\d{2}\b|\b20\d{2}[-/. ][A-Z]{3}\b/g) || []) {
      const iso = normalizeExpiry(tok);
      if (iso) { expiry = iso; break; }
    }
  }

  return { lot, expiry, raw };
}

// ── Browser OCR engine ────────────────────────────────────────────────

// One Tesseract worker, created on first use and reused — the WASM core + the
// English model are ~12 MB to load, so we never pay that twice. Lazy-imported so
// none of it touches the initial bundle (same pattern as the @zxing QR writer).
let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) => createWorker("eng"));
  }
  return workerPromise;
}

// Run OCR on a captured frame (a canvas / ImageBitmap / blob) and return the
// parsed { lot, expiry }. Resolves to {} on any failure — OCR is best-effort and
// the user can always type the values in.
export async function ocrLotExpiry(source) {
  if (!source) return {};
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(source);
    return parseLotExpiry(data?.text || "");
  } catch {
    return {};
  }
}
