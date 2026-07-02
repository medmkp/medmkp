import assert from "node:assert/strict";
import test from "node:test";
import { parseLotExpiry, parseCatalogRefs, buildIdentityQuery } from "./ocrLabel.js";

// Real Tesseract output captured from the dental-label photos in test/photos
// (the same labels we scan in the field). These pin the lot-number parser against
// the OCR text it actually sees — boxed "LOT" markers that render as bracket/pipe
// junk, bare numeric lots with the marker dropped, and HIBC strings that must NOT
// be mistaken for a lot.
const FIXTURES = {
  "glovesNumericNoMarker": "pm_—\n\n71iL\n\n=\n\nHIELO\n\n(c\\V) p 3\n\neNO\n\n|=\n\nAZ\n\n£ L\n\n1 Gl\n\nACIAL\n\npeEQU\n\nBL\n\na \\\n\nPETIT\n\nVES\n\n\\\n\npath\n\nSUNLIG T\n\nUMIE\n\nRE DU SOLEIL\n\nITRILE\n\n\\\\z\n\nKEEP\n\nAWAY\n\n\\\n\n\\\n\n5\n\np'EXAMEN ENN\n\n®—\n\nON\n\nRV\n\nEJA\n\nLo LA LUZ SOLA\n\nA.\n\nNITR\n\ntested\n\nMA! ENE\n\nMEN D\n\n\\ove\n\neation y\n\nhet als\n\ndical glove t\n\n38°\n\nc TEMPERAT\n\nRATURE\n\nDistributed by\n\nlage oR RA LIMITE\n\nINC\n\n{+\n\nfically for the YP Ale\n\nsess\n\nte segin\n\nEMP\n\nRY SCHE!\n\nbe select® spe\n\npect\n\ncamen\n\nHEN\n\n#gganda\n\nn selecci©\n\nnar\n\ne con\n\nform\n\nidad con\n\n5°C\n\nURYEA\n\nTMD 6978\n\nmiot\n\npéutt\n\n1747 USA\n\nrapéuticos ©\n\nac\n\nuticos”\n\n‘ id\n\nKEEP DR\n\nY\n\nMELVILLE,\n\nmacos quimiote\n\narios fa\n\nos qul\n\nerape\n\nnt e\n\nnction du\n\nR\n\nAU SE\n\nente 2 lae\n\nxpOSiCi©\n\n\\a pene\n\ntract\n\nn de farmac\n\nARDE\n\nSECO\n\nncia de ©\n\ne gua\n\ndico\n\n\\a\n\npene racio\n\nnes specifi qu\n\n&sistanc\n\nMANT\n\nENER\n\nMad\n\nein China\n\nna\n\nte\n\nantes\n\nnt\n\netre select\n\nthe!\n\nrapeutid\n\njuer lat\n\nencia de gu\n\nques do\n\nHecho en\n\nn Chine\n\nments ©\n\nhimiothera uti\n\ngerents\n\ndrugs: » (p\n\nratique courante\n\nFabrique\n\ndes medica\n\nce alaper\n\nim h motherapy\n\nasa rest\n\nNO\n\nT MADE\n\nedical glov\n\nes to permeati©\n\nWITHN\n\nATURAL\n\nA ®\n\nmiothérap®\n\nutiques\n\nRUBB\n\n>2A0min.\n\n24015414\n\n>240min.\n\nFluorouraci\n\n| (50.0mg/ml)\n\n>240min-\n\n10-20\n\n25mg/m\\)\n\n>240min\n\n2 2029-10-19\n\nof) 2024\n\nMethotrexate\n\nH mg/m!\n\n>240min\n\n>240min.\n\nMitomyci\n\nn\n\n>240min.\n\npaclitaxel\n\n(Taxol)\n\n(6.0mg/m\n\n112-6830\n\n>240min\n\n\\fate\n\n1.0 mg/ml)\n\nVincristine u\n\n>240min\n\n0\n\n>240min\n\nsafety\n\nLL\n\nling oF material\n\nreview drug \\abe\n\nve\n\nomg/ml)-\n\nd. Users should\n\n& 5\n\nThiotep2 (1\n\npes of drugs use\n\n\\\n\n{)\n\n0\n\n\\d be\n\nbased ©\n\nn the specific ty\n\nJ shou\n\n| of protection\n\nLos usuario\n\ns deberian\n\n17)291019\n\nRevi# 2022/09\n\njequat\n\ne leve\n\nado.\n\nde farmaco\n\ns especifico utiliz\n\nd Thiote\n\npa (10mg/m)\n\npasar en el tipo\n\neria\n\nn adecuado-\n\n, seleccio?\n\nde guantes se deb\n\nn niv\n\nel de proteccio\n\nrs sont\n\na\n\nara d\n\neterminar u\n\nes utilisatev\n\nquat\n\nol farmaco P\n\ne medica\n\nments utilisés- L\n\notection ade\n\nmt) and Thiote\n\npa (10mg/m!)\n\nspéct\n\nfigue\n\ndeterminer\n\nun niveau e\n\n;.3mgf\n\nnder\n\nsur le type\n\ntilisés afi\n\nn de\n\n_—\n\nnts devrait s\n\nd medica\n\ni\n\nmen su\n\n-\n\n-\n\n—\n\n-\n\n—\n\n-\n\n2 séle\n\nction des £2\n\nde sécurité\n\n-\n\n-\n\ndonnées\n\nfiches de\n\n—\n\n—\n\n—\n\n——\n\n«=\n\n*\n",
  "pulpdentBoxedLot": "11S\n\nae\n\n™\n\nnN\n\n9\n\n3\n\nwih\n\narse\n\n%\n\n5)\n\nwe\n\nx\n\n%\n\n7\n\ni\n\npit\n\nLl\n\n£2\n\n7\n\ni\n\nih\n\n“4\n\nNe\n\naA\n\nrv\n\nVf\n\n%\n\n&\n\nip\n\nPr\n\nee\n\n£8\n\nwe\n\nZs\n\nZAR\n\nx\n\nR24\n\nH\n\nROYALE BULK SYRINGES ONLY\n\nFey\n\n% 1.2 ML SYRINGES, NO TIPS\n\n=\n\n[LoT]|260212\n\nmp] C €\n\n0)2028-02-12 Konly 0459\n\n*+D701ER242/$$32802122602122*\n\nAdvena Ltd - MALTA\n\nMedEnyoy Switzerland\n\nower Business Center-2nd Fir\n\nGotthardstrasse 28\n\nower St, Swatar, BKR 4013\n\n5 Je202 zug, Swizerland\n\nPULPDENT Corporation\n\n80 Oakland St, Watertown, MA 02472 USA www. pulpdent.com\n\nTy\n\n\\A\n\n(4\n\npit\n\n|]\n\n\\\n\ny [}\n",
  "syngauzeHibcOnly": "101-4583 y\nJaHENR ySCHE IN pissduled by: Distribuides\n\nNf par: Vertrie\niss\n\naNGAUZESD for sore\nECIR\n\nril d.\nHenry St U.K. Holdings Lt\n\n: Non-Woven / Non Sterile\n\nMl-Purpose Spinges\n\nGillingham MES 0SB UK.\n£144 ph (10.1 em x 10.1 cm) Rev2 10/2018\n\nJl Sponges / Gasas / Compresses | Tupfer ll\n( ¢ +H65810\n\n",
  // Patterson gut suture (test/barcodes/patterson-suture-label.jpg), SPARSE_TEXT
  // read. The gold foil's boxed "LOT" symbol OCRs to junk glued to the real batch
  // ("EIM607840"), and the HIBC primary "*+D5207089953427*" loses its "*+…*" framing
  // and comes back as a bare "953427" — a fragment of the scanned code, NOT a lot.
  "pattersonHibcFragment": "“Q\n= A\nSterile Suture US}\nDENTAL\nCP 53\nGUT 3-0\ni\nfll\nin\n520\n|\nI\n953427\"\n|\nIA\nond\n§\nDistributed by : Patterson Dental Supply, Inc.\n2 Paul, IAN 55120\n1 Doz. (\na\nrd.\n3/8 CIRCLE\nREV.CUT\nETT\nDS-24\ng\nEIM607840 § 2016 - 01.\n",
  // Henry Schein exam-gloves carton side (test/photos/IMG_0776.jpg), AUTO read.
  // The ISO boxed "LOT" symbol OCRs to "[or]" (no readable LOT letters), the batch
  // is a bare 11-digit run, and the expiry's hourglass symbol reads as "|".
  "glovesBoxedLotSymbol": "[or] 24140121021\n\n| 2024-12-12\n\n",
  // A dental curing-light device label, SPARSE_TEXT read of a rendered label run
  // through the production pipeline. Devices carry a SERIAL number (SN), not a lot;
  // there is no LOT on the carton. The bare serial "20451178" sits right where a
  // batch run would, so without a serial-marker exclusion the numeric fallback
  // surfaced it as the lot — a fabricated batch. "Mfg Date 2025-03" is a
  // manufacture date, never an expiry.
  "deviceSerialNoLot": "DentCure LED\n\nCordless Curing Light\n\nMODEL: DC-800\n\nREF 660360\n\nSN 20451178\n\nMfg Date 2025-03\n\nKerr Corporation Orange, CA USA\n",
  // Real dual-PSM OCR (SPARSE) of a rendered anesthetic carton whose shelf-life is
  // stamped "USE BEFORE" (not "USE BY") with a compact MM/YY date. Ground truth by
  // eye: LOT AB12345, expiry 09/26 → 2026-09-30.
  "useBeforeCompactExpiry": "ACME Dental Anesthetic\n\nLidocaine HCl 2%\n\nLOT AB12345\n\nUSE BEFORE 09/26\n",
  // Real dual-PSM OCR (SPARSE) of a rendered fluoride-varnish carton stamped "BEST
  // BY" (not "BEST BEFORE") with a compact MM/YY date. Ground truth: LOT 8842AA,
  // expiry 09/26 → 2026-09-30.
  "bestByCompactExpiry": "OralGuard Fluoride Varnish\n\nREORDER 5567-A\n\nBEST BY 09/26\n\nLOT 8842AA\n"
};

test("reads a bare numeric lot when OCR drops the boxed LOT marker (HS gloves, 24015414)", () => {
  // Tesseract reads "24015414" as a standalone token with no usable "LOT" word
  // next to it; the numeric fallback must still surface it.
  assert.equal(parseLotExpiry(FIXTURES.glovesNumericNoMarker).lot, "24015414");
});

test("reads a bare numeric lot when the boxed LOT symbol OCRs to junk (gloves carton, 24140121021)", () => {
  // The ISO boxed "LOT" symbol read as "[or]" (no usable LOT letters) and the
  // hourglass expiry symbol as "|"; the batch is a bare 11-digit run that the
  // numeric fallback must still surface, and the bare ISO expiry must read.
  const r = parseLotExpiry(FIXTURES.glovesBoxedLotSymbol);
  assert.equal(r.lot, "24140121021");
  assert.equal(r.expiry, "2024-12-12");
});

test("reads a lot through boxed-LOT bracket/pipe noise (Pulpdent ER24, 260212)", () => {
  // OCR: "[LoT]|260212" — the box frame glued "]|" between marker and value.
  assert.equal(parseLotExpiry(FIXTURES.pulpdentBoxedLot).lot, "260212");
});

test("does not mistake an HIBC barcode string for a lot (HS SYNGAUZE)", () => {
  // OCR read the HIBC "+H65810..." as text; "H65810" must not become a lot.
  assert.equal(parseLotExpiry(FIXTURES.syngauzeHibcOnly).lot, undefined);
});

test("does not surface an OCR fragment of the scanned HIBC code as a lot (Patterson)", () => {
  // The HIBC primary "*+D5207089953427*" lost its "*+…*" framing in the read and
  // came back as a bare "953427". In the scan flow that primary is the code we just
  // scanned (it carries no lot, which is why OCR ran at all), so it's handed back as
  // `barcode`: "953427" is a substring of it and must NOT be surfaced as the batch —
  // a fabricated lot on a recall pull-list is worse than a blank one. The expiry,
  // which is a real bare date, still reads.
  const r = parseLotExpiry(FIXTURES.pattersonHibcFragment, { barcode: "+D5207089953427" });
  assert.equal(r.lot, undefined);
  assert.equal(r.expiry, "2016-01-31");
});

test("does not surface a device serial number as a lot (SN / S/N / SERIAL)", () => {
  // A curing-light carton carries a serial, not a batch — the bare "20451178" after
  // "SN" must not be read as the lot (a serial on a recall pull-list is as wrong as
  // any other fabricated batch), and the manufacture date is not an expiry.
  const r = parseLotExpiry(FIXTURES.deviceSerialNoLot);
  assert.equal(r.lot, undefined);
  assert.equal(r.expiry, undefined);
  // The marker's other spellings, and its "NO"/"NUMBER" filler, are all excluded.
  assert.equal(parseLotExpiry("S/N 12345678").lot, undefined);
  assert.equal(parseLotExpiry("SERIAL NO 12345678").lot, undefined);
  assert.equal(parseLotExpiry("SERIAL: 24015414").lot, undefined);
  // ...and the same "REF NO <value>" filler lookback catches a bare catalog number.
  assert.equal(parseLotExpiry("REF NO 660360").lot, undefined);
  // A genuine lot printed beside a serial still wins (keyword path), and a bare
  // batch with no serial marker still reads.
  assert.equal(parseLotExpiry("SN 99887766 LOT 24015414").lot, "24015414");
  assert.equal(parseLotExpiry("24015414").lot, "24015414");
});

test("keyword path: plain LOT, NO. variant, and alphanumeric value", () => {
  assert.equal(parseLotExpiry("LOT 13593092\nEXP 2028-12-04").lot, "13593092");
  assert.equal(parseLotExpiry("LOT NO. 12345678").lot, "12345678");
  assert.equal(parseLotExpiry("LOT: A219").lot, "A219");
});

test("keyword path: combined 'Lot No./ Mfg. Date/ Exp Date' header (Beacons atenolol)", () => {
  // Pharma boxes pack the field names into one header row with the values below,
  // so the token after "LOT NO" is the next label word, not the lot. Skip the
  // field-label chain to the first value, and don't mistake the expiry for the lot.
  const r = parseLotExpiry("Lot No./ Mfg. Date/ Exp Date:\n05057 05/2017 01/2021");
  assert.equal(r.lot, "05057");
  assert.equal(r.expiry, "2021-01-31");
  // A value-less "… Exp Date:" header must not let the expiry become the lot.
  assert.equal(parseLotExpiry("LOT/EXP DATE 2025-01").lot, undefined);
});

test("does not read a barcode's printed digits as a lot (generated UPC HRI)", () => {
  // The human-readable line under a 1D barcode (here 785306841174, a valid UPC-A)
  // OCRs as a bare digit run with no LOT marker. It's the scanned code, not a lot:
  // rejected as a self-validating GTIN even when no barcode is supplied...
  assert.equal(parseLotExpiry("785306841174").lot, undefined);
  // ...and rejected outright when we pass the code that was scanned (incl. the
  // 13-digit EAN-13 "0"-padded form of the same UPC).
  assert.equal(parseLotExpiry("785306841174", { barcode: "785306841174" }).lot, undefined);
  assert.equal(parseLotExpiry("785306841174", { barcode: "0785306841174" }).lot, undefined);
});

test("scanned code is excluded but a real lot beside it still reads", () => {
  // Both the barcode HRI and a genuine numeric lot are in frame; the lot wins.
  assert.equal(
    parseLotExpiry("785306841174 LOT 24015414", { barcode: "785306841174" }).lot,
    "24015414",
  );
  // Even with no LOT marker, the non-GTIN batch is taken and the barcode dropped.
  assert.equal(
    parseLotExpiry("785306841174 24015414", { barcode: "785306841174" }).lot,
    "24015414",
  );
});

test("numeric fallback: stamped letter+digits batch, but not a REF number", () => {
  assert.equal(parseLotExpiry("A00626\nREF: 112-6757").lot, "A00626");
  assert.equal(parseLotExpiry("REF 112-6830").lot, undefined);
  // A dashed catalog number on its own is not a lot.
  assert.equal(parseLotExpiry("101-4583").lot, undefined);
});

test("expiry: does not read a revision date as the expiry (HS SYNGAUZE 'Rev2 10/2018')", () => {
  assert.equal(parseLotExpiry(FIXTURES.syngauzeHibcOnly).expiry, undefined);
});

test("expiry: real bare expiries still read (Pulpdent 2028-02-12, gloves 2029-10-19)", () => {
  // Pulpdent has one bare date; the gloves box has a revision date (excluded) and
  // the GS1 expiry 2029-10-19 — the latest surviving date wins over a mfg date.
  assert.equal(parseLotExpiry(FIXTURES.pulpdentBoxedLot).expiry, "2028-02-12");
  assert.equal(parseLotExpiry(FIXTURES.glovesNumericNoMarker).expiry, "2029-10-19");
});

test("expiry: reads the USE BEFORE / BEST BY shelf-life markers (compact MM/YY)", () => {
  // "USE BEFORE" and "BEST BY" are the everyday phrasings a carton stamps instead
  // of "USE BY" / "BEST BEFORE"; their compact 2-digit-year date only the keyword
  // path reads, so the marker must recognize them.
  const ub = parseLotExpiry(FIXTURES.useBeforeCompactExpiry);
  assert.equal(ub.lot, "AB12345");
  assert.equal(ub.expiry, "2026-09-30");
  const bb = parseLotExpiry(FIXTURES.bestByCompactExpiry);
  assert.equal(bb.lot, "8842AA");
  assert.equal(bb.expiry, "2026-09-30");
  // The original spellings still read.
  assert.equal(parseLotExpiry("USE BY 09/26").expiry, "2026-09-30");
  assert.equal(parseLotExpiry("BEST BEFORE 09/26").expiry, "2026-09-30");
});

test("expiry: keyword path is trusted, even when the date is in the past", () => {
  assert.equal(parseLotExpiry("EXP 2026-07-31").expiry, "2026-07-31");
  assert.equal(parseLotExpiry("USE BY 2027-03").expiry, "2027-03-31"); // month precision
  assert.equal(parseLotExpiry("EXP 2018-01-15").expiry, "2018-01-15"); // expired item
});

test("expiry: tolerates the box-edge glyph family the '1' digit OCRs to (Patterson '2016 - 0[;:|]')", () => {
  // A real suture label's "2016 - 01" edge OCRs the trailing "1" / box stroke as
  // ";" in one capture and ":" or "|" in others — all coerce to the same month.
  for (const edge of [";", ":", "|"]) {
    assert.equal(parseLotExpiry(`[ET M607840 % 2016 - 0${edge}`).expiry, "2016-01-31");
  }
});

test("expiry: a manufacture date never beats the real expiry", () => {
  // Keyword wins outright.
  assert.equal(parseLotExpiry("MFG 2024-01-10\nEXP 2026-01-10").expiry, "2026-01-10");
  // Both bare (separated by other label text, as on a real box): the MFG-tagged
  // date is dropped and the bare expiry survives — and a prior date's MFG tag
  // doesn't leak onto it.
  assert.equal(parseLotExpiry("MFG 2024-01-10 STERILE 2026-01-10").expiry, "2026-01-10");
  // Two untagged dates: the latest is the expiry, not whichever OCR read first.
  assert.equal(parseLotExpiry("2024-05-01 STERILE 2029-10-19").expiry, "2029-10-19");
});

// ── Identity OCR: catalog/REF numbers (the exact ?code= lookup path) ──────────

test("REF marker names the catalog number (DSI suture 'REF DS-PGRA40')", () => {
  const refs = parseCatalogRefs("PGA Rapid USP 4-0\nREF DS-PGRA40\nSTERILE EO");
  assert.equal(refs[0], "DS-PGRA40");
});

test("REF marker tolerates 'NO' / box-glyph separators (REORDER NO 101-4583)", () => {
  assert.deepEqual(parseCatalogRefs("RE-ORDER NO. 101-4583"), ["101-4583"]);
  assert.equal(parseCatalogRefs("CAT# 9302-1 SOFT TIP")[0], "9302-1");
});

test("unanchored REF-shaped tokens are found in reading order", () => {
  // DemeTECH suture: the catalog number prints with no usable marker.
  assert.ok(parseCatalogRefs("DemeSORB 3-0 PGA283016F4P 12 PCS").includes("PGA283016F4P"));
  // Dentsply RINN equipment model.
  assert.ok(parseCatalogRefs("DENTSPLY C020100 RINN CRESCENT").includes("C020100"));
});

test("REF parser rejects the scanned barcode, GTINs, GS1/HIBC and dates", () => {
  // The scanned code's printed line is never a REF.
  assert.deepEqual(parseCatalogRefs("REF 30884522026721", { barcode: "30884522026721" }), []);
  // A self-validating UPC-A is a barcode print, not a catalog number.
  assert.deepEqual(parseCatalogRefs("785306841174"), []);
  // GS1 / HIBC fragments carry +*$() and are excluded.
  assert.deepEqual(parseCatalogRefs("*+D701ER242/$$32802122602122*"), []);
  // A bare date is not a REF.
  assert.deepEqual(parseCatalogRefs("2026-01-10"), []);
});

test("REF parser dedupes and caps the candidate list", () => {
  const refs = parseCatalogRefs("REF AB-12 AB-12 CD34 EF56 GH78 IJ90 KL12");
  assert.equal(refs[0], "AB-12");
  assert.ok(refs.length <= 5);
  assert.equal(new Set(refs).size, refs.length);
});

// ── Identity OCR: denoised fuzzy query (the ?q= substitute path) ──────────────

test("query keeps brand + product-type words, drops boilerplate and codes", () => {
  const q = buildIdentityQuery(
    "Chlorhexidine Gluconate 0.12% Oral Rinse, USP\nNDC 16571-128-15\n" +
      "Rx Only  Dist. By Rising Pharma Holdings Inc.  0316571128150",
  );
  const words = q.split(" ");
  assert.ok(words.includes("chlorhexidine"));
  assert.ok(words.includes("gluconate"));
  assert.ok(words.includes("rinse"));
  // boilerplate / units / brand-noise dropped
  for (const drop of ["ndc", "rx", "only", "inc", "usp", "0316571128150"]) {
    assert.ok(!words.includes(drop), `expected ${drop} to be dropped`);
  }
});

test("query surfaces the distinctive type for a prophy-angle label", () => {
  const q = buildIdentityQuery(
    "PROPHY ANGLES\nERGONOMICALLY DESIGNED · DISPOSABLE · LATEX FREE\n9302/SOFT TIP\n" +
      "PACKAGED 100 INDIVIDUALLY WRAPPED PIECES",
  );
  const words = q.split(" ");
  assert.ok(words.includes("prophy"));
  assert.ok(words.includes("angles"));
  assert.ok(!words.includes("disposable")); // boilerplate
  assert.ok(!words.includes("9302")); // a code, not a type word
});

test("query is bounded and free of bare numbers / alnum codes", () => {
  const q = buildIdentityQuery("DemeSORB Polyglycolic Acid Absorbable Suture Violet PGA283016F4P 75 CM 12 PCS");
  const words = q.split(" ").filter(Boolean);
  assert.ok(words.length <= 8);
  assert.ok(words.every((w) => /^[a-z]/.test(w) && !/\d/.test(w)));
  assert.ok(words.includes("polyglycolic"));
});
