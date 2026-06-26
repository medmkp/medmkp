import assert from "node:assert/strict";
import test from "node:test";
import { parseLotExpiry } from "./ocrLabel.js";

// Real Tesseract output captured from the dental-label photos in test/photos
// (the same labels we scan in the field). These pin the lot-number parser against
// the OCR text it actually sees — boxed "LOT" markers that render as bracket/pipe
// junk, bare numeric lots with the marker dropped, and HIBC strings that must NOT
// be mistaken for a lot.
const FIXTURES = {
  "glovesNumericNoMarker": "pm_—\n\n71iL\n\n=\n\nHIELO\n\n(c\\V) p 3\n\neNO\n\n|=\n\nAZ\n\n£ L\n\n1 Gl\n\nACIAL\n\npeEQU\n\nBL\n\na \\\n\nPETIT\n\nVES\n\n\\\n\npath\n\nSUNLIG T\n\nUMIE\n\nRE DU SOLEIL\n\nITRILE\n\n\\\\z\n\nKEEP\n\nAWAY\n\n\\\n\n\\\n\n5\n\np'EXAMEN ENN\n\n®—\n\nON\n\nRV\n\nEJA\n\nLo LA LUZ SOLA\n\nA.\n\nNITR\n\ntested\n\nMA! ENE\n\nMEN D\n\n\\ove\n\neation y\n\nhet als\n\ndical glove t\n\n38°\n\nc TEMPERAT\n\nRATURE\n\nDistributed by\n\nlage oR RA LIMITE\n\nINC\n\n{+\n\nfically for the YP Ale\n\nsess\n\nte segin\n\nEMP\n\nRY SCHE!\n\nbe select® spe\n\npect\n\ncamen\n\nHEN\n\n#gganda\n\nn selecci©\n\nnar\n\ne con\n\nform\n\nidad con\n\n5°C\n\nURYEA\n\nTMD 6978\n\nmiot\n\npéutt\n\n1747 USA\n\nrapéuticos ©\n\nac\n\nuticos”\n\n‘ id\n\nKEEP DR\n\nY\n\nMELVILLE,\n\nmacos quimiote\n\narios fa\n\nos qul\n\nerape\n\nnt e\n\nnction du\n\nR\n\nAU SE\n\nente 2 lae\n\nxpOSiCi©\n\n\\a pene\n\ntract\n\nn de farmac\n\nARDE\n\nSECO\n\nncia de ©\n\ne gua\n\ndico\n\n\\a\n\npene racio\n\nnes specifi qu\n\n&sistanc\n\nMANT\n\nENER\n\nMad\n\nein China\n\nna\n\nte\n\nantes\n\nnt\n\netre select\n\nthe!\n\nrapeutid\n\njuer lat\n\nencia de gu\n\nques do\n\nHecho en\n\nn Chine\n\nments ©\n\nhimiothera uti\n\ngerents\n\ndrugs: » (p\n\nratique courante\n\nFabrique\n\ndes medica\n\nce alaper\n\nim h motherapy\n\nasa rest\n\nNO\n\nT MADE\n\nedical glov\n\nes to permeati©\n\nWITHN\n\nATURAL\n\nA ®\n\nmiothérap®\n\nutiques\n\nRUBB\n\n>2A0min.\n\n24015414\n\n>240min.\n\nFluorouraci\n\n| (50.0mg/ml)\n\n>240min-\n\n10-20\n\n25mg/m\\)\n\n>240min\n\n2 2029-10-19\n\nof) 2024\n\nMethotrexate\n\nH mg/m!\n\n>240min\n\n>240min.\n\nMitomyci\n\nn\n\n>240min.\n\npaclitaxel\n\n(Taxol)\n\n(6.0mg/m\n\n112-6830\n\n>240min\n\n\\fate\n\n1.0 mg/ml)\n\nVincristine u\n\n>240min\n\n0\n\n>240min\n\nsafety\n\nLL\n\nling oF material\n\nreview drug \\abe\n\nve\n\nomg/ml)-\n\nd. Users should\n\n& 5\n\nThiotep2 (1\n\npes of drugs use\n\n\\\n\n{)\n\n0\n\n\\d be\n\nbased ©\n\nn the specific ty\n\nJ shou\n\n| of protection\n\nLos usuario\n\ns deberian\n\n17)291019\n\nRevi# 2022/09\n\njequat\n\ne leve\n\nado.\n\nde farmaco\n\ns especifico utiliz\n\nd Thiote\n\npa (10mg/m)\n\npasar en el tipo\n\neria\n\nn adecuado-\n\n, seleccio?\n\nde guantes se deb\n\nn niv\n\nel de proteccio\n\nrs sont\n\na\n\nara d\n\neterminar u\n\nes utilisatev\n\nquat\n\nol farmaco P\n\ne medica\n\nments utilisés- L\n\notection ade\n\nmt) and Thiote\n\npa (10mg/m!)\n\nspéct\n\nfigue\n\ndeterminer\n\nun niveau e\n\n;.3mgf\n\nnder\n\nsur le type\n\ntilisés afi\n\nn de\n\n_—\n\nnts devrait s\n\nd medica\n\ni\n\nmen su\n\n-\n\n-\n\n—\n\n-\n\n—\n\n-\n\n2 séle\n\nction des £2\n\nde sécurité\n\n-\n\n-\n\ndonnées\n\nfiches de\n\n—\n\n—\n\n—\n\n——\n\n«=\n\n*\n",
  "pulpdentBoxedLot": "11S\n\nae\n\n™\n\nnN\n\n9\n\n3\n\nwih\n\narse\n\n%\n\n5)\n\nwe\n\nx\n\n%\n\n7\n\ni\n\npit\n\nLl\n\n£2\n\n7\n\ni\n\nih\n\n“4\n\nNe\n\naA\n\nrv\n\nVf\n\n%\n\n&\n\nip\n\nPr\n\nee\n\n£8\n\nwe\n\nZs\n\nZAR\n\nx\n\nR24\n\nH\n\nROYALE BULK SYRINGES ONLY\n\nFey\n\n% 1.2 ML SYRINGES, NO TIPS\n\n=\n\n[LoT]|260212\n\nmp] C €\n\n0)2028-02-12 Konly 0459\n\n*+D701ER242/$$32802122602122*\n\nAdvena Ltd - MALTA\n\nMedEnyoy Switzerland\n\nower Business Center-2nd Fir\n\nGotthardstrasse 28\n\nower St, Swatar, BKR 4013\n\n5 Je202 zug, Swizerland\n\nPULPDENT Corporation\n\n80 Oakland St, Watertown, MA 02472 USA www. pulpdent.com\n\nTy\n\n\\A\n\n(4\n\npit\n\n|]\n\n\\\n\ny [}\n",
  "syngauzeHibcOnly": "101-4583 y\nJaHENR ySCHE IN pissduled by: Distribuides\n\nNf par: Vertrie\niss\n\naNGAUZESD for sore\nECIR\n\nril d.\nHenry St U.K. Holdings Lt\n\n: Non-Woven / Non Sterile\n\nMl-Purpose Spinges\n\nGillingham MES 0SB UK.\n£144 ph (10.1 em x 10.1 cm) Rev2 10/2018\n\nJl Sponges / Gasas / Compresses | Tupfer ll\n( ¢ +H65810\n\n"
};

test("reads a bare numeric lot when OCR drops the boxed LOT marker (HS gloves, 24015414)", () => {
  // Tesseract reads "24015414" as a standalone token with no usable "LOT" word
  // next to it; the numeric fallback must still surface it.
  assert.equal(parseLotExpiry(FIXTURES.glovesNumericNoMarker).lot, "24015414");
});

test("reads a lot through boxed-LOT bracket/pipe noise (Pulpdent ER24, 260212)", () => {
  // OCR: "[LoT]|260212" — the box frame glued "]|" between marker and value.
  assert.equal(parseLotExpiry(FIXTURES.pulpdentBoxedLot).lot, "260212");
});

test("does not mistake an HIBC barcode string for a lot (HS SYNGAUZE)", () => {
  // OCR read the HIBC "+H65810..." as text; "H65810" must not become a lot.
  assert.equal(parseLotExpiry(FIXTURES.syngauzeHibcOnly).lot, undefined);
});

test("keyword path: plain LOT, NO. variant, and alphanumeric value", () => {
  assert.equal(parseLotExpiry("LOT 13593092\nEXP 2028-12-04").lot, "13593092");
  assert.equal(parseLotExpiry("LOT NO. 12345678").lot, "12345678");
  assert.equal(parseLotExpiry("LOT: A219").lot, "A219");
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

test("expiry: keyword path is trusted, even when the date is in the past", () => {
  assert.equal(parseLotExpiry("EXP 2026-07-31").expiry, "2026-07-31");
  assert.equal(parseLotExpiry("USE BY 2027-03").expiry, "2027-03-31"); // month precision
  assert.equal(parseLotExpiry("EXP 2018-01-15").expiry, "2018-01-15"); // expired item
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
