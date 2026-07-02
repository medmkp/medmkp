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

// GS1 AI (17) prints expiry as YYMMDD. A day of 00 means month precision.
function gs1Expiry(raw) {
  const m = String(raw || "").match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const yy = +m[1];
  const year = yy >= 90 ? 1900 + yy : 2000 + yy;
  return isoFrom(year, +m[2], +m[3]);
}

// Parse one date-ish token into an ISO `YYYY-MM-DD`, or null. The 4-digit year
// anchors the format, which avoids the MM/DD vs DD/MM ambiguity for the common
// label layouts: a year on the left is Y-M(-D); a year on the right is M(-D)-Y.
export function normalizeExpiry(raw, { shortYear = false } = {}) {
  if (!raw) return null;
  // The "1" of a month/day, and the vertical stroke of a label's box frame, both
  // OCR to the same family of punctuation depending on the capture — a real
  // Patterson suture label's "2016 - 01" edge came back "2016 - 0;" in one read
  // and "2016 - 0:" / "2016 - 0|" in others. Coerce that whole glyph family to "1"
  // up front; isoFrom still range-checks, so a non-date coercion falls through.
  const t = String(raw).trim().toUpperCase().replace(/[;!:|]/g, "1").replace(/\s+/g, " ");

  // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  let m = t.match(/\b(20\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/);
  if (m) return isoFrom(+m[1], +m[2], +m[3]);

  // YYYY-MM / YYYY/MM  (month precision → end of month)
  m = t.match(/\b(20\d{2})\s*[-/.]\s*(\d{1,2})\b/);
  if (m) return isoFrom(+m[1], +m[2], 0);

  // MM-DD-YYYY / MM/DD/YYYY (US order). When the first group can't be a month
  // (>12) the US reading is impossible, so it's the European DD-MM-YYYY order —
  // most non-US cartons print "31.12.2026" / "13/04/2023", and dropping it loses
  // the expiry entirely. Fall back to the day-month swap only when the US reading
  // fails isoFrom's range check: a genuine "03/15/2026" still parses US-first and
  // a still-ambiguous "04/05/2026" stays US order (lot/expiry are assistive — we
  // don't guess a date order we can't prove from the digits themselves).
  m = t.match(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(20\d{2})\b/);
  if (m) return isoFrom(+m[3], +m[1], +m[2]) || isoFrom(+m[3], +m[2], +m[1]);

  // MM-YYYY / MM/YYYY  (month precision → end of month)
  m = t.match(/\b(\d{1,2})\s*[-/.]\s*(20\d{2})\b/);
  if (m) return isoFrom(+m[2], +m[1], 0);

  // MM/YY (2-digit year) — the compact form pharma/dental labels often stamp
  // ("EXP 09/21", "Expiry Date 09/21"). Gated behind `shortYear`, set only by the
  // keyword-anchored callers: a 2-digit year is far more ambiguous than a 4-digit
  // one (a bare "10/24" could be a catalog or size, not a date), so we trust it
  // only right after an EXP / USE BY / EXPIRY marker — the bare-date fallback never
  // passes it. Strict 2-digit/2-digit so a single-digit ratio ("1/2") can't reach
  // it; the month is range-checked by isoFrom so a non-month pair ("50/50", "28/34")
  // falls through. Runs after every 4-digit-year form so "06/2027" stays MM-YYYY.
  if (shortYear) {
    // DD.MM.YY / DD/MM/YY (day precision, 2-digit year) — the compact stamp EU
    // cartons print ("EXP 31.12.26"). Must run before the 2-group MM/YY below, which
    // would otherwise grab the leading "31.12" and reject it (month 31), losing the
    // date. Same US-first-then-swap disambiguation as the 4-digit DD-MM-YYYY path: try
    // the US month/day reading, fall back to day/month only when the US one fails
    // isoFrom's range check — so "31.12.26" resolves European (day 31) while a genuine
    // "03.15.26" stays US order. Strict 2/2/2 groups so a 4-digit-year form never
    // reaches here; isoFrom range-checks both readings, so a non-date triple falls
    // through. Still gated behind the keyword `shortYear` — a bare "31.12.26" is too
    // ambiguous to trust.
    m = t.match(/\b(\d{2})\s*[-/.]\s*(\d{2})\s*[-/.]\s*(\d{2})\b/);
    if (m) {
      const yr = 2000 + +m[3];
      const iso = isoFrom(yr, +m[1], +m[2]) || isoFrom(yr, +m[2], +m[1]);
      if (iso) return iso;
    }
    m = t.match(/\b(\d{2})\s*[-/.]\s*(\d{2})\b/);
    if (m) {
      const iso = isoFrom(2000 + +m[2], +m[1], 0);
      if (iso) return iso;
    }
  }

  // DD MON YYYY / MON DD YYYY  (a month name *with* a day — the format suture and
  // anesthetic cartons print, "15 JAN 2027" / "15-JAN-2027" / "JAN 15 2027"). Day
  // precision, so this must run before the month-only MON paths below: those drop
  // the printed day and resolve to month-end, pushing a mid-month expiry up to
  // ~four weeks late (a "15 JAN" item would read as good through the 31st). The
  // month name is matched as 3–9 letters and keyed off its first three, so the
  // 4-letter "SEPT" and a fully-spelled "15 DECEMBER 2026" / "JANUARY 15, 2027"
  // land here too rather than on the month-only path, which would lose the printed
  // day; MONTHS still gates a non-month run. The separators allow the usual OCR
  // spacings; the MON-first form also allows a comma before the year — the standard
  // US long-date punctuation a label prints as "EXP JAN 15, 2027" / "EXP JANUARY
  // 15, 2027" (the keyword capture below keeps the comma so the year reaches here);
  // isoFrom still range-checks the result.
  m = t.match(/\b(\d{1,2})\s*[-/. ]\s*([A-Z]{3,9})\s*[-/. ]\s*(20\d{2})\b/);
  if (m && MONTHS[m[2].slice(0, 3)]) return isoFrom(+m[3], MONTHS[m[2].slice(0, 3)], +m[1]);
  m = t.match(/\b([A-Z]{3,9})\s*[-/. ]\s*(\d{1,2})\s*[-/., ]\s*(20\d{2})\b/);
  if (m && MONTHS[m[1].slice(0, 3)]) return isoFrom(+m[3], MONTHS[m[1].slice(0, 3)], +m[2]);

  // MON YYYY / YYYY MON  (month name, month precision). The name may be the
  // 3-letter abbreviation ("JAN 2027") or fully spelled out ("DECEMBER 2026") —
  // OTC and international cartons print "EXP DECEMBER 2026" / "USE BY SEPTEMBER
  // 2027" in full. Match 3–9 letters and key off the first three, which uniquely
  // name the month for every English spelling (JAN/JANUARY, SEP/SEPT/SEPTEMBER).
  // Only the keyword path ever feeds a full word here — the bare-date fallback
  // emits 3-letter MON tokens only (see its matchAll below) — so a stray
  // "MARKETED 2026" never reaches this, and MONTHS still gates a non-month run.
  m = t.match(/\b([A-Z]{3,9})\s*[-/. ]\s*(20\d{2})\b/) || t.match(/\b(20\d{2})\s*[-/. ]\s*([A-Z]{3,9})\b/);
  if (m) {
    const mon = MONTHS[(m[1] || "").slice(0, 3)] || MONTHS[(m[2] || "").slice(0, 3)];
    const yr = /^\d/.test(m[1]) ? +m[1] : +m[2];
    if (mon) return isoFrom(yr, mon, 0);
  }

  // DD MON YY / MON YY (2-digit year, month *name*) — the compact carton stamp a
  // small box prints as "EXP 15 DEC 26" (day precision) or "EXP DEC 26" (Dec 2026,
  // month precision). Same `shortYear` trust gate as the numeric MM/YY above: a
  // 2-digit year is too ambiguous to read off a bare "DEC 26", so only the keyword-
  // anchored callers reach it. This MUST run after every 4-digit-year MON path
  // above — otherwise the `(\d{2})` here would swallow the day of a "JAN 15 2026"
  // (reading "15" as year 2015) before the day-precision path could claim it. The
  // `\b(\d{2})\b` anchor takes exactly two digits, so a 4-digit year never reaches
  // it; MONTHS gates a non-month run; DD-MON-YY runs first so a printed day keeps
  // day precision rather than collapsing to month-end.
  if (shortYear) {
    m = t.match(/\b(\d{1,2})\s*[-/. ]\s*([A-Z]{3,9})\s*[-/. ]\s*(\d{2})\b/);
    if (m && MONTHS[m[2].slice(0, 3)]) {
      const iso = isoFrom(2000 + +m[3], MONTHS[m[2].slice(0, 3)], +m[1]);
      if (iso) return iso;
    }
    m = t.match(/\b([A-Z]{3,9})\s*[-/. ]\s*(\d{2})\b/);
    if (m && MONTHS[m[1].slice(0, 3)]) {
      const iso = isoFrom(2000 + +m[2], MONTHS[m[1].slice(0, 3)], 0);
      if (iso) return iso;
    }
  }

  // Compact all-digit date, no separators. A dot-matrix / inkjet printer runs
  // the groups together and OCR then drops the thin separator entirely, so a
  // real "Exp.Dt. 2027/11" comes back as "202711" and a "20260131" as one run.
  // Read YYYYMMDD (day precision) then YYYYMM (month precision → month-end). The
  // year is anchored to 20\d{2} and the month/day range-checked here AND by
  // isoFrom, so a lot or a phone number can't masquerade as a date. Only the
  // keyword/structured callers ever pass a bare run in (the bare-date fallback
  // requires a separator), so this never fires on unanchored body text.
  m = t.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if (m) return isoFrom(+m[1], +m[2], +m[3]);
  m = t.match(/\b(20\d{2})(0[1-9]|1[0-2])\b/);
  if (m) return isoFrom(+m[1], +m[2], 0);

  // OCR misreads a digit inside a numeric date as a look-alike letter, which
  // defeats the four layouts above (they all demand a clean 20\d{2}). A real
  // medical label's "07.2011" came back "07.20N1" — the joined "11" strokes read
  // as "N" — and the same slip gives "2O11", "20I1", "20S5". Coerce the common
  // letter→digit homoglyphs and retry once. This runs only after the month-name
  // paths, so a genuine "JAN 2026" never reaches it, and isoFrom still range-
  // checks the result, so a coerced non-date just falls through to null.
  if (/20/.test(t) && /[A-Z]/.test(t)) {
    const fixed = t
      .replace(/[OQ]/g, "0").replace(/[ILN|]/g, "1").replace(/S/g, "5")
      .replace(/B/g, "8").replace(/Z/g, "2").replace(/G/g, "6");
    if (fixed !== t) return normalizeExpiry(fixed);
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
  // YYYYMM — a separator-less compact expiry ("Exp.Dt. 2027/11" → "202711").
  // Anchored to a 20xx year + a valid 01–12 month so a true 6-digit batch number
  // is mostly unaffected; without this the expiry's own digits get picked up as
  // the lot when no "LOT" marker survives the read.
  if (/^20\d{2}(0[1-9]|1[0-2])$/.test(d)) return true; // YYYYMM
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

// Whether a digit run is a *fragment* of the code we already scanned. The
// human-readable line printed under a barcode is that code spelled out, and when
// OCR reads a long code whose delimiters don't survive — an HIBC primary like
// "*+D5207089953427*" comes back as a bare "953427" once the "*+…L*" framing is
// dropped — the leftover digits are a substring of the scanned code, never a batch
// number. `sameCode` only catches the whole line; this catches a piece of it. Gated
// on a known scanned code, and a real lot is essentially never a 6+ digit substring
// of the item's own barcode; the rare miss just leaves the lot blank, which we
// already prefer to a wrong one (a bad lot on a recall pull-list is worse than none).
function isCodeFragment(v, barcode) {
  const code = String(barcode || "").replace(/\D/g, "");
  const digits = String(v || "").replace(/\D/g, "");
  return digits.length >= 6 && code.length > digits.length && code.includes(digits);
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
    // A catalog/reference/serial marker names this token as an identifier, not a
    // batch — skip it. Serial numbers (SN / S/N / SERIAL) sit on device/equipment
    // labels (a curing light, a handpiece) exactly where a bare digit run would
    // otherwise be mistaken for the lot, and a serial on a recall pull-list is as
    // wrong as any other fabricated batch. Look back through an optional
    // "NO"/"NUMBER"/"#" filler so "SERIAL NO 20451178" / "REF NO 660360" are caught
    // as well as the bare "SN 20451178". (A genuine "LOT NO <value>" never reaches
    // here — the keyword path claims it first.)
    const prev = tokens[i - 1] || "";
    const marker = /^(?:N[O0]\.?|NUMBER|#)$/.test(prev) ? (tokens[i - 2] || "") : prev;
    if (/(?:^|\b)(?:REF|REORDER|CAT|CATALOG|MODEL|SKU|REV|S\/?N|SERIAL)\b/.test(marker)) continue;
    if (/^[A-Z]\d{5,8}$/.test(tok)) return tok; // letter + digits stamp (A00626)
    const run = tok.match(/(?:^|[^0-9A-Z])(\d{6,14})(?:$|[^0-9A-Z])/);
    if (run && !isDateLikeDigits(run[1]) && !/\d-\d/.test(tok)) {
      if (barcode && sameCode(run[1], barcode)) continue; // the scanned code's printed line
      if (isCodeFragment(run[1], barcode)) continue;      // an OCR fragment of that code (HIBC)
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
  // LOT / BATCH [NO|NUMBER|#] <value>. Keyword-anchored is the precise path; tolerate
  // the usual garbles of the three letters (L0T, LDT, LOI) AND the boxed "LOT" marker
  // on medical labels: its frame OCRs as bracket/pipe junk glued to the value, so
  // Tesseract reads "[LoT]|260212" or "LOT] 24015414". The separator between the
  // marker and the value therefore allows those box glyphs, not just spaces and
  // colons. "BATCH" is also accepted as a standalone marker, not only as a descriptor
  // after "LOT": non-US pharma/medical labels stamp the batch as "Batch No." rather
  // than "Lot" (a real Difenac/Diclofenac carton prints "BATCH NO : BJ11529"), and the
  // shape fallback can't recover an alphanumeric value like that — it isn't a bare
  // digit run nor a single-letter+digits stamp. The Romance-language equivalents are
  // accepted as standalone markers too: Spanish/Portuguese cartons stamp the batch as
  // "LOTE" and Italian ones as "LOTTO" (a real Novocol/Clorexidina import prints "LOTE
  // L2F5A" / "LOTTO 7A2208"), and the shape fallback can't recover an alphanumeric
  // value like that either. They share the "LOT" stem, so the marker just allows an
  // optional "E" (LOTE) or "TO" (LOTTO) suffix; the `\b` after it still keeps "LOTION"
  // and "LOTS" out (neither is LOT + one of those suffixes at a word boundary).
  // Some labels spell the descriptor as
  // "LOT Batch Code <value>", and OCR can drop "Batch" and leave "LOT Code <value>",
  // so skip that wording before taking the value. The descriptor is also a *chain*:
  // pharma boxes pack the field names into one header row ("Lot No./ Mfg. Date/ Exp
  // Date:") with the values on the line below, so the token right after "LOT NO" is the
  // next label word ("MFG"), not the lot — skip the whole run of field-label words (MFG
  // / DATE / EXP …) and their "/"-style separators to reach the first value. Value
  // allows common batch separators (A-219, 13593092, M607840).
  const lotMatch = flat.match(
    /\b(?:L[O0D][T1I](?:E|T[O0])?|BATCH)\b[\s.:#)\]\[|/]*(?:(?:N[O0]\.?|NUMBER|BATCH(?:\s+CODE)?|CODE|MF[GD]|MANUF(?:ACTURE)?D?|DATE|EXP(?:IRY|IRES|IRATION)?|USE\s+BY|BEST\s+BEFORE)[\s.:#)\]\[|/]*)*([A-Z0-9][A-Z0-9\-/]{2,19})/,
  );
  if (
    lotMatch &&
    !/^(?:N[O0]|NUMBER|NUM|BATCH|CODE|MF[GD]|DATE|EXP\w*)$/.test(lotMatch[1]) &&
    // When the chain above skips a "… Exp Date:" header, the first value can be the
    // expiry itself (a value-less lot row); a lot that parses as a date is that, so
    // reject it and fall through rather than mis-tag a date as the batch number.
    normalizeExpiry(lotMatch[1]) == null &&
    !(barcode && sameCode(lotMatch[1], barcode)) // not the scanned code mis-tagged as LOT
  ) {
    lot = lotMatch[1];
  } else {
    const aiLot = flat.match(/\(10\)\s*([A-Z0-9][A-Z0-9\-/]{0,19})/);
    if (aiLot && !(barcode && sameCode(aiLot[1], barcode))) lot = aiLot[1];
  }
  if (!lot) {
    // German "Ch.-B." (Chargenbezeichnung) is the EU equivalent of LOT — the marker
    // every German/Austrian/Swiss carton stamps the batch under (an Aliud/Zentiva
    // Oxycodon blister prints "Ch.-B.: 6230058"). The shape fallback below only
    // catches an all-digit or single-letter+digits batch, so a typical alphanumeric
    // Charge ("K2F306") is invisible without anchoring on its marker. The "B" follows
    // "CH" with only OCR-garbled dots/dashes between them, and the usual box/colon
    // glyphs separate the marker from its value.
    const chargeMatch = flat.match(/\bCH[.\-\s]*B[\s.\-:#)\]\[|]*([A-Z0-9][A-Z0-9\-/]{2,19})/);
    if (chargeMatch && !(barcode && sameCode(chargeMatch[1], barcode))) lot = chargeMatch[1];
  }
  if (!lot) {
    // No usable "LOT" marker — the box edges defeated the classifier entirely (on
    // a real Patterson label "LOT" read as "[ETI"), or the batch is printed bare.
    // Fall back to a batch-number SHAPE among the tokens. See findBatchToken.
    lot = findBatchToken(flat, barcode);
  }

  let expiry;
  // Prefer a keyword-tagged date (EXP / USE BY / BEST BEFORE), which is
  // unambiguous — trusted even if it's in the past, since an expired item on the
  // shelf is exactly what we want to surface.
  // The value window is wide enough for a fully-spelled month *with* a day and a
  // 4-digit year ("SEPTEMBER 15, 2027" / "15 SEPTEMBER 2027" are 18/17 chars);
  // normalizeExpiry still finds the date inside, so a longer capture just gives it
  // harmless trailing context, and it scans left-to-right so the keyword-adjacent
  // date wins. Too narrow a window silently truncates the year off a long date and
  // loses the expiry. The class also allows a comma so a US long date ("JAN 15,
  // 2027" / "JANUARY 15, 2027") is captured through the year rather than truncated
  // at the comma — without it the day-precision MON path below never sees the year
  // and the expiry is lost. The optional "DATE" after the
  // marker covers the common "Expiry Date 09/21" / "EXP. DATE: 09/21" wording, whose
  // word/colon would otherwise sit between the keyword and the value and block the
  // capture — but it's only skipped when an actual date follows (the lookahead), so a
  // packed "Lot No./ Mfg. Date/ Exp Date:" header whose values trail on the next line
  // ("…Exp Date: 05057 05/2017 01/2021") is left to the latest-date fallback below
  // rather than grabbing the lot/Mfg date that sits right after the header. shortYear
  // lets this trusted, keyword-vouched path read a 2-digit-year MM/YY ("09/21") that
  // the bare fallback deliberately won't.
  const expKw = flat.match(/\b(?:EXP(?:IR(?:Y|ES|ATION))?|USE BY|BEST BEFORE|BB)\b[\s:.]*(?:DATE\b[\s:.]*(?=\d{1,2}\s*[-/.]))?([0-9A-Z][0-9A-Z\-/., ]{4,18})/);
  if (expKw) expiry = normalizeExpiry(expKw[1], { shortYear: true });
  if (!expiry) {
    const aiExp = flat.match(/\(17\)\s*(\d{6})\b/);
    if (aiExp) expiry = gs1Expiry(aiExp[1]);
  }
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
    // A date run is a digit group followed by 1–2 separator-joined groups. The
    // separator ([-/.]) is REQUIRED between groups so a bare space can't bridge
    // two adjacent numbers — without that, a lot printed just before the date
    // ("0710709 07.2011") swallows the date's leading month and the expiry is
    // lost. Spaces are still tolerated *around* the separator (Patterson prints
    // "2016 - 01"), and the trailing groups allow OCR look-alike letters AND the
    // box-edge punctuation ";:|" in the year/month ("07.20N1" for 07.2011, "2016 -
    // 0:" for "2016 - 01"), which normalizeExpiry coerces before validating. The
    // two MON-anchored alternatives keep the 3-letter-month case. The first of them
    // ("MON YYYY") carries a `(?![-/.]\d)` guard so it can't swallow a year that is
    // really the head of a longer numeric date: without it a non-month 3-letter word
    // sitting right before a bare ISO date ("CAD 2026-09" — the Spanish "caducidad"
    // marker, or any stray "USP"/"REF"-style triplet) matched "CAD 2026", consumed the
    // year, and — since MONTHS rejects "CAD" — dropped it, leaving only "-09" for the
    // real date, so the expiry was lost entirely. A genuine "MAR 2028" (nothing but a
    // space/end after the year) is unaffected.
    for (const m of flat.matchAll(/(?:^|[^A-Z0-9])(\d{1,4}(?:\s*[-/.]\s*[\dA-Z;!:|]{1,4}){1,2})(?=$|[^A-Z0-9])|\b([A-Z]{3}[-/. ]20\d{2})\b(?![-/.]\d)|\b(20\d{2}[-/. ][A-Z]{3})\b/g)) {
      const val = m[1] || m[2] || m[3];
      const iso = normalizeExpiry(val);
      if (!iso) continue;
      const dateIndex = m.index + (m[0].length - val.length);
      const before = flat.slice(Math.max(prevEnd, dateIndex - 14), dateIndex);
      prevEnd = m.index + m[0].length;
      if (/\b(?:REV|MFG|MFD|MANUF|MADE)/.test(before)) continue;
      candidates.push(iso);
    }
    if (candidates.length) expiry = candidates.sort()[candidates.length - 1];
  }

  return { lot, expiry, raw };
}

// ── Identity OCR: find the product when the barcode didn't ────────────────
//
// A scan whose barcode resolves to nothing — a 2D-only suture label, a serial-
// numbered piece of equipment, an Rx UPC we don't stock — still has the product
// printed on it in plain text. We read that on-device and hand the backend two
// routes it already serves:
//   • parseCatalogRefs → the manufacturer's catalog / REF number, looked up
//     EXACTLY against the SKU index (?code=). Highest precision: an exact lookup
//     self-filters, so a wrong candidate simply returns nothing.
//   • buildIdentityQuery → a denoised brand + product-type query for the fuzzy
//     ?q= path, to suggest possible substitutes.
// Both are assistive — a suggestion the user confirms before it's linked to a
// compliance record, never an auto-match — the same rule the lot/expiry OCR follows.

// Boilerplate that carries no product identity: regulatory text, distributor
// addresses, pack/units, and the words a catalog name never hangs on. Dropped
// from the fuzzy query so the distinctive brand/type tokens dominate the rank.
const QUERY_STOP = new Set([
  // regulatory / handling
  "STERILE", "NONSTERILE", "NON", "STERILIZED", "RESTERILIZE", "REUSE", "SINGLE", "USE",
  "DISPOSABLE", "LATEX", "FREE", "CAUTION", "WARNING", "FEDERAL", "LAW", "PRESCRIPTION",
  "ONLY", "KEEP", "AWAY", "DRY", "STORE", "STORAGE", "SEE", "INSERT", "CONTENTS",
  "DELIVERS", "DIRECTIONS", "INGREDIENTS", "ACTIVE", "INACTIVE", "MADE", "ASSEMBLED",
  "DISTRIBUTED", "MANUFACTURED", "MANUFACTURER", "PACKAGED", "INDIVIDUALLY", "WRAPPED",
  // org / address noise
  "CORPORATION", "CORP", "COMPANY", "INC", "LTD", "LLC", "GMBH", "USA", "CHINA", "GERMANY",
  "WWW", "COM", "HTTP", "HTTPS", "TEL", "FAX", "STREET", "SUITE", "ROAD", "DRIVE",
  // pack / units / measures
  "BOX", "BX", "CASE", "PACK", "PKG", "PCS", "PIECES", "EACH", "CT", "NET", "BULK",
  "REFILL", "KIT", "UNIT", "DOSE", "ML", "MG", "GM", "CM", "MM", "OZ", "METRIC",
  // label field markers
  "REF", "REORDER", "CAT", "CATALOG", "ITEM", "LOT", "EXP", "EXPIRY", "EXPIRATION",
  "REV", "REVISED", "MFG", "MFD", "DATE", "BATCH", "CODE", "MODEL", "SERIAL", "TYPE",
  "USP", "NDC", "RX",
  // marketing adjectives — they're often the longest word on a label, so dropping
  // them keeps a product-type word (not "ERGONOMICALLY") as the distinctive token.
  "ERGONOMICALLY", "DESIGNED", "PROFESSIONAL", "PREMIUM", "QUALITY", "ADVANCED",
]);

// Shared exclusions for a catalog/REF candidate: never the scanned code's own
// printed line, a self-validating GTIN, a GS1/HIBC fragment, or a date — the same
// prints the lot parser already learns to reject.
function refExcluded(v, barcode) {
  if (/[+*$()]/.test(v)) return true;                    // GS1 / HIBC fragment
  if (!/^[A-Z0-9][A-Z0-9/-]{2,19}$/.test(v)) return true;
  const bare = v.replace(/\D/g, "");
  if (barcode && sameCode(v, barcode)) return true;
  if (isGtin(bare)) return true;
  if (isDateLikeDigits(bare)) return true;
  return false;
}

// True when an UNANCHORED token (no REF/CAT marker beside it) looks like a catalog
// number on its own: an alnum run mixing letters AND digits (DS-PGRA40,
// PGA283016F4P, C020100, ER24), or a dashed reorder number (101-4583). Stricter
// than the marker path because there's no marker vouching for it — a bare numeric
// here is far more likely to be a quantity or a stray digit run than a SKU.
function isRefCandidate(tok, barcode) {
  const v = tok.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, ""); // trim edge punctuation
  if (refExcluded(v, barcode)) return false;
  const hasAlpha = /[A-Z]/.test(v);
  const hasDigit = /\d/.test(v);
  if (hasAlpha && hasDigit) return true;                  // mixed alnum REF
  if (!hasAlpha && /^\d{3}-\d{3,4}$/.test(v)) return true; // dashed reorder number
  return false;
}

// Catalog / REF numbers printed on a label, most-trustworthy first. A REF / CAT /
// REORDER / ITEM marker names the value explicitly, so those come first; bare
// REF-shaped tokens follow as a fallback. Deduped, capped — each is tried as an
// exact ?code= lookup, so a generous-but-bounded list is cheap and safe.
export function parseCatalogRefs(text, { barcode } = {}) {
  const flat = String(text || "").toUpperCase().replace(/\s+/g, " ").trim();
  const refs = [];
  const seen = new Set();
  // A marker (REF/CAT/REORDER) vouches for its value, so the marker path accepts
  // a bare-numeric or short-dashed catalog number (CAT# 9302, REF 660360) that the
  // unanchored path would reject; both still apply the shared exclusions.
  const add = (raw, loose) => {
    const v = String(raw || "").replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
    if (!v || seen.has(v)) return;
    if (loose ? refExcluded(v, barcode) : !isRefCandidate(v, barcode)) return;
    seen.add(v);
    refs.push(v);
  };

  // Marker-anchored: "REF DS-PGRA40", "REORDER NO 101-4583", "CAT# 9302-1".
  const markerRe = /\b(?:REF|RE-?ORDER|CAT(?:ALOG)?|ITEM)\b[\s.:#)\]\[|-]*(?:N[O0]\b[\s.:#)\]\[|-]*)?([A-Z0-9][A-Z0-9/-]{2,19})/g;
  for (const m of flat.matchAll(markerRe)) add(m[1], true);

  // Unanchored REF-shaped tokens, in reading order.
  for (const tok of flat.split(" ")) {
    if (refs.length >= 5) break;
    add(tok, false);
  }
  return refs.slice(0, 5);
}

// A denoised search query from label text: the distinctive brand + product-type
// words, with barcode digits, GS1/HIBC strings, units, addresses and regulatory
// boilerplate stripped. Fed to the fuzzy ?q= path, whose tokenizer + trigram rank
// floats the closest catalog products; keep it short so noise doesn't dilute it.
export function buildIdentityQuery(text) {
  const words = String(text || "").toUpperCase().match(/[A-Z][A-Z0-9'./-]{2,}/g) || [];
  const kept = [];
  const seen = new Set();
  for (const word of words) {
    const w = word.replace(/[^A-Z0-9]/g, "");
    if (w.length < 3 || w.length > 18) continue;
    if (!/[A-Z]/.test(w)) continue;        // need a letter — drops bare numbers
    if (/\d/.test(w) && /[A-Z]/.test(w)) continue; // drop alnum codes (those are REFs)
    if (QUERY_STOP.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    kept.push(w);
    if (kept.length >= 8) break;
  }
  return kept.join(" ").toLowerCase();
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

// Read a captured frame for product IDENTITY when the barcode matched nothing.
// Returns { refs, query, raw }: the catalog/REF numbers to look up exactly, a
// denoised query for the fuzzy fallback, and the raw text (so the caller can pull
// lot/expiry off the same read with parseLotExpiry — no second OCR pass). Uses the
// layout-aware AUTO mode, which keeps the brand/description blocks intact, and
// resolves to empty on any failure (the user can always search by hand).
export async function ocrIdentity(source, { barcode } = {}) {
  if (!source) return { refs: [], query: "", raw: "" };
  try {
    const [{ PSM }, worker] = await Promise.all([getModule(), getWorker()]);
    const image = preprocess(source);
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const { data } = await worker.recognize(image);
    const raw = data?.text || "";
    return { refs: parseCatalogRefs(raw, { barcode }), query: buildIdentityQuery(raw), raw };
  } catch {
    return { refs: [], query: "", raw: "" };
  }
}
