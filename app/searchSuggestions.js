// Popular dental search terms used to power the top-bar search dropdown.
//
// Rather than previewing individual products as you type (which forces users to
// scan a cramped product grid), the dropdown suggests the search *phrases*
// people actually look for — "gloves small", "burs diamonds", "masks level 3".
// This matches how buyers think about what they need.
//
// The corpus is seeded from real Net32 autocomplete suggestions harvested across
// our top dental categories (2026-06-28). Each root keeps its suggestions in
// Net32's popularity order, so prefix matches surface most-searched first.
// CORPUS_START
export const SEARCH_SUGGESTIONS = [
  "gloves", "gloves small", "gloves medium", "gloves large", "gloves xs", "gloves small nitrile",
  "gloves nitrile", "gloves black", "gloves latex", "gloves 300", "masks", "masks astm level 3",
  "masks level 2", "masks level 1", "masks black level 3", "masks cranberry", "masks sensitive", "masks astm level 2",
  "cranberry masks", "beesure masks", "burs", "burs diamonds", "burs 557", "burs 330 diamonds",
  "burs 245", "burs carbide", "burs 57 ss", "burs finishing flame", "burs football", "burs diamonds fine",
  "bibs", "bibs 3 ply", "bibs house brand", "bibs 2 ply", "bibs blue", "bibs white",
  "bibs 3ply", "bibs green", "bibs pink", "bibs lavender", "impression", "impression trays",
  "impression material", "impression tips", "impression gun", "impression trays medium", "impression putty", "impression tray #3",
  "impression trays large", "impression tray #5", "anesthetic", "anesthetic syringe", "anesthetic gel", "anesthetic lidocaine",
  "anesthetic needles", "anesthetic warmer", "anesthetic spray", "anesthetic needle short", "anesthetic orabloc", "anesthetic holder",
  "composite", "composite a2", "composite gun", "composite instrument", "composite a1", "composite a3",
  "composite warmer", "composite polisher", "composite finishing burs", "composite polishing", "bonding", "bonding agent",
  "bonding adhesive", "bonding resin", "bonding well", "bonding agent self etching", "bonding pentron", "bonding brushes",
  "bonding dish", "bonding trays", "etch", "etch tips", "etch refill", "etch gel",
  "etchants", "etching gel", "etch tips blue", "etch rite", "etchant gel", "etch jumbo",
  "sutures 3.0 chromic", "sutures 3.0", "sutures chromic", "sutures 5.0", "sutures 3.0 silk", "sutures 3.0 gut",
  "sutures dental absorbable", "sutures size 5.0", "sutures with needle", "sutures violet 3.0", "needles", "needles 30 gauge",
  "needles 27 gauge", "needles short", "needles long", "needles 30g", "needles 30 gauge short", "needles 30 gauge metal hub",
  "needles x short", "needles yellow", "cement", "cement tips", "cement permanent", "cement spatula",
  "cement mixing tips", "cement mixing spatula", "cement relyx", "cement tips brown", "cement remover", "cement panavia translucent",
  "alginate", "alginate alternative", "alginate substitute", "alginate fast set", "alginate impression material", "alginate trays",
  "alginate regular set", "alginate tray cleaner", "alginate adhesive", "alginate alternative fast set", "fluoride varnish", "fluorides",
  "fluoride varnish 5%", "fluoride foam", "fluoride gel", "fluoride rinse", "fluoride varnish mint", "fluoride trays",
  "fluoride toothpaste", "fluoride varnish bubble gum", "sealant", "sealants pit and fissure", "sealant tips", "sealant material",
  "sealant clinpro", "sealant brush tips", "sealant clinpro pit fissure", "sealants pit and fissure clinpro", "clinpro sealant", "embrace sealant",
  "prophy", "prophy angles", "prophy paste", "prophy cups", "prophy paste mint", "prophy handpiece",
  "prophy brush", "prophy angles soft", "prophy paste coarse", "prophy angle soft cup", "matrix", "matrix bands",
  "matrix ring", "matrix band #1", "matrix bands greater curvature", "matrix button", "matrix strips", "matrix bands disposable",
  "matrix bands #2", "matrix band holder", "wedges", "wedges plastic", "wedges wooden", "wedges small",
  "wedges assorted", "wedges garrison", "wedge wands", "wedge for garrison", "wedges with aluminum", "wedges pink",
  "files", "files 15", "file holder", "files #6", "file #35", "file 25mm",
  "files 10", "files #20", "file stand", "file 10 21mm", "gutta percha", "gutta percha points",
  "gutta percha cutter", "gutta percha 25 .04", "gutta percha 25", "gutta percha 25 .06", "gutta percha points taper 0.04 #25", "gutta percha f2",
  "gutta percha .04", "gutta percha points fine", "pumice", "pumice paste", "pumice cups", "pumice powder",
  "pumice prophy paste", "pumice prophy paste fluoride free", "pumice fine", "pumice medium", "pumice coarse", "pumice wheel",
  "polishing", "polishing discs", "polishing burs", "polishing cups", "polishing strips", "polishing paste",
  "polishing wheel", "polishing brush", "polishing points", "polishing disk", "cotton", "cotton rolls",
  "cotton tip applicators", "cotton pliers", "cotton tip", "cotton pellets", "cotton tipped applicators", "cotton roll dispenser",
  "cotton swabs", "cotton rolls house brand", "gauze", "gauze 2 x 2", "gauze 4x4", "gauze 2x2",
  "gauze 2 x 2 house brand", "gauze 4 x 4", "gauze dispenser", "gauze non woven", "gauze 2 x 2 cotton filled", "gauze sterile",
  "scaler", "scalers for hygiene", "scaler ultrasonic", "scaler set", "scaler tips", "scaler 204s",
  "scalers s204", "scaler 135", "scalers sh5", "scaler universal anterior", "mirror", "mirror head",
  "mirror handle", "mirror heads #5", "mirror head #5 cone socket", "mirror handle #5", "mirror covers", "mirror defoggers",
  "mirror with handle", "mirror head size 5", "forceps", "forceps 150", "forceps extraction", "forceps 222",
  "forceps 62", "forceps 151", "forceps 69", "forceps 13", "150 forceps", "151 forceps",
  "scalpel", "scalpel handle", "scalpel #15", "scalpel blades", "scalpel holder", "scalpel #12",
  "disposable scalpel", "disposable scalpel 15", "#15 scalpel blades", "#12 scalpel", "blade", "blade holder",
  "blade 15", "blade 15c", "blade handle", "blade 12", "blade remover", "blades 15 hu-friedy",
  "blade #10", "15 blade", "retraction cord", "retraction cord 00", "retraction cord 0", "retraction cord #2",
  "retraction cord packer", "retraction cord 000", "retraction cord with epinephrine", "retraction cord size 0", "retraction cord size 1", "retraction cord ultrapak",
  "articulating paper", "articulating paper forceps", "articulating paper thin", "articulating paper horseshoe", "articulating paper thick", "articulating paper red blue",
  "articulating paper 200 microns", "articulating paper blue", "articulating paper refill", "articulating paper blue red", "microbrush", "microbrush fine",
  "micro brush applicators", "microbrush regular", "microbrush super fine", "microbrush yellow", "microbrush applicators", "microbrush dispenser",
  "microbrush green", "micro brush applicators regular", "saliva ejector tip", "saliva ejector valve", "saliva ejector tubing", "saliva ejector rubber tip",
  "saliva ejector lever", "saliva ejector traps", "saliva ejector backflow prevention", "saliva ejector adapter", "saliva ejector screens", "saliva ejector high volume",
  "disinfectant", "disinfectant wipes", "disinfectant spray", "disinfectant solution", "disinfectant wipes case", "disinfectant pack",
  "wipes disinfectant", "surface disinfectant", "glutaraldehyde disinfectant", "optim 1 disinfectant", "barrier", "barrier film",
  "barrier tape", "barrier envelopes size 2", "barrier sleeves", "barrier film blue", "barrier envelopes size 0", "barrier film clear",
  "barrier envelopes", "barrier film purple", "gowns", "gowns disposable", "gowns jackets", "gowns medium",
  "gowns small", "gowns jacket disposable", "gown reusable", "gowns large", "gowns with cuff", "gowns pink",
  "sponge", "sponges endo", "sponge grafting", "sponges for endo", "sponge foam", "sponge grafting plug",
  "sponge bone grafting", "sponge 2x2", "endo sponge", "hemostatic sponge", "endo", "endo ice",
  "endo files", "endo ice spray", "endo explorer", "endo irrigation syringe", "endo syringe", "endo ring",
  "endo ruler", "crown", "crown & bridge", "crown remover", "crown prep burs", "crown and bridge temporary material",
  "crown cement", "crown burs", "crown and bridge mixing tips", "crown prep burs diamonds", "crown spreader", "waxed floss",
  "wax orthodontic", "waxed floss refill", "wax rims", "wax strips", "wax floss", "wax knife",
  "wax sheet", "wax bite", "waxing instrument"
];
// CORPUS_END

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Return up to `limit` popular search phrases matching the typed query.
// Prefix matches rank first (in corpus/popularity order), then phrases that
// contain the query as a later word. The phrase identical to the query is
// dropped — the dropdown renders that as its own "Search …" row.
export function suggestSearchTerms(query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const term of SEARCH_SUGGESTIONS) {
    const t = norm(term);
    if (t === q) continue;
    if (t.startsWith(q)) starts.push(term);
    else if (t.includes(` ${q}`) || t.includes(q)) contains.push(term);
  }
  return [...starts, ...contains].slice(0, limit);
}
