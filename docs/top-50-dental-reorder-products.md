# Top 50 Dental Practice Reorder Products

*Last updated: 2026-06-17*

## What this is

A domain-grounded ranking of the dental consumables that practices reorder most
frequently and spend the most on annually. It is meant to prioritize supplier
onboarding and catalog coverage.

**This is not computed from MedMKP usage data.** As of this writing the app has
no persisted demand-side history: uploaded invoices/requests are stored
ephemerally (`lib/requestStore.js`), the working reorder list lives in the
browser's `localStorage`, and there is no order/line-item table in the Medusa
backend. The ~39k-row supplier catalog is supply-side (what vendors sell), not
demand-side (what practices rebuy). The list below is therefore based on
established dental-practice procurement benchmarks, and it aligns with the seed
categories in [PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md).

## How to read it

"Reordered most often" and "costs the most" are different rankings. Gloves win
both; composite resin and endo files are high-dollar but less frequent; saliva
ejectors are constant but cheap. Rows are ordered by blended procurement weight
(frequency x spend), with both dimensions flagged so the table can be re-sorted
by either.

- **Frequency:** Continuous (~every order) - Weekly - Monthly
- **Spend (relative annual):** `$` low -> `$$$$` top-tier

## Tier 1 - On nearly every PO (high frequency + high spend)

| # | Product | Category | Frequency | Spend |
|---|---------|----------|-----------|-------|
| 1 | Nitrile exam gloves (S/M/L) | Infection control / PPE | Continuous | $$$$ |
| 2 | ASTM Level 3 earloop face masks | PPE | Continuous | $$$ |
| 3 | Surface disinfectant wipes (CaviWipes-type) | Infection control | Continuous | $$$ |
| 4 | Patient bibs (2/3-ply) | Barriers | Continuous | $$ |
| 5 | Sterilization pouches (self-seal) | Sterilization | Continuous | $$ |
| 6 | Saliva ejectors | Evacuation | Continuous | $$ |
| 7 | HVE evacuation tips | Evacuation | Continuous | $$ |
| 8 | Cotton rolls (#2 medium) | Chairside | Continuous | $$ |
| 9 | Gauze sponges (2x2 / 4x4) | Chairside | Continuous | $$ |
| 10 | Air/water syringe tips (disposable) | Chairside | Continuous | $$ |
| 11 | Barrier film / tape (4x6 perforated) | Barriers | Continuous | $$ |
| 12 | Tray sleeves / barrier bags | Barriers | Continuous | $$ |
| 13 | Prophy angles (disposable soft-cup) | Hygiene | Weekly | $$$ |
| 14 | Prophy paste (medium/coarse) | Hygiene | Weekly | $$ |

## Tier 2 - Anesthesia & high-dollar restorative (the real spend drivers)

| # | Product | Category | Frequency | Spend |
|---|---------|----------|-----------|-------|
| 15 | Lidocaine 2% 1:100k epi carpules | Anesthesia | Continuous | $$$ |
| 16 | Articaine 4% 1:100k carpules | Anesthesia | Continuous | $$$ |
| 17 | Dental needles (27G long / 30G short) | Anesthesia | Continuous | $$ |
| 18 | Topical anesthetic gel | Anesthesia | Monthly | $ |
| 19 | Composite resin - universal shades (compules/syringe) | Restorative | Weekly | $$$$ |
| 20 | Universal bonding agent / adhesive | Restorative | Weekly | $$$$ |
| 21 | Phosphoric acid etchant (37% gel) | Restorative | Weekly | $ |
| 22 | VPS/PVS impression material (light + heavy body) | Impression | Weekly | $$$$ |
| 23 | Flowable composite | Restorative | Weekly | $$ |
| 24 | Temp crown material (bis-acryl) | Restorative | Weekly | $$$ |
| 25 | Diamond burs (assorted) | Rotary | Weekly | $$$ |
| 26 | Carbide burs | Rotary | Weekly | $$ |
| 27 | Bite registration material (VPS) | Impression | Weekly | $$ |
| 28 | Disposable impression trays | Impression | Monthly | $$ |
| 29 | Resin / permanent cement | Restorative | Monthly | $$$ |
| 30 | Temporary cement (eugenol / non-eugenol) | Restorative | Monthly | $$ |
| 31 | Glass ionomer liner / base | Restorative | Monthly | $$ |
| 32 | Matrix bands + sectional system + wedges | Restorative | Monthly | $$ |
| 33 | Finishing/polishing discs, strips, points | Restorative | Monthly | $$ |
| 34 | Articulating paper (blue/red) | Restorative | Monthly | $ |

## Tier 3 - Endodontic (high ticket where endo is done in-house)

| # | Product | Category | Frequency | Spend |
|---|---------|----------|-----------|-------|
| 35 | Rotary NiTi files (single-use trend) | Endo | Weekly | $$$$ |
| 36 | Endo hand files (K-files / reamers) | Endo | Monthly | $$ |
| 37 | Gutta percha points | Endo | Monthly | $ |
| 38 | Paper points | Endo | Monthly | $ |
| 39 | Sodium hypochlorite / EDTA irrigant | Endo | Monthly | $ |

## Tier 4 - Preventive, hygiene & remaining disposables

| # | Product | Category | Frequency | Spend |
|---|---------|----------|-----------|-------|
| 40 | Fluoride varnish (unit-dose) | Preventive | Weekly | $$$ |
| 41 | Pit & fissure sealant material | Preventive | Monthly | $$ |
| 42 | Take-home patient kits (brush/floss/paste) | Patient | Continuous | $$ |
| 43 | Microbrush applicators | Chairside | Continuous | $ |
| 44 | Cotton tip applicators | Chairside | Continuous | $ |
| 45 | Patient rinse cups (5 oz) | Chairside | Continuous | $ |
| 46 | Disposable mouth mirrors / mirror sleeves | Chairside | Monthly | $ |
| 47 | Spore test strips / Class V sterilization indicators | Sterilization | Monthly | $$ |
| 48 | Isolation gowns (disposable) | PPE | Monthly | $$$ |
| 49 | X-ray sensor sleeves / phosphor-plate barriers | Imaging barriers | Continuous | $$ |
| 50 | Surface disinfectant spray + hand sanitizer (gallon) | Infection control | Monthly | $$ |

## Where the money goes

- **By frequency:** infection-control/PPE + chairside disposables dominate -
  gloves, masks, barriers, saliva ejectors, cotton/gauze. Cheap per unit, but on
  every order and collectively the #1 supply category (often 25-35% of supply
  spend).
- **By dollars:** the leaders are gloves, then the restorative chemistry
  (composite, bonding agent, impression material, temp material), endo rotary
  files, and anesthetic carpules + needles - high unit cost even when reordered
  only weekly/monthly. Dental supply spend typically runs ~5-7% of collections,
  so for an $800K-$1M GP practice that is roughly $50-70K/yr concentrated in
  these lines.

## Making this data-backed

1. **Ground against the catalog.** Map each of these 50 to the matching SKUs in
   the `medmkp_supplier_product` rows and attach real per-unit price spreads
   across Pearson / American Dental / Sky / Shasta.
2. **Persist demand.** Once invoice uploads are stored server-side (today they
   are ephemeral), aggregate real line items into an actual reorder-frequency +
   spend ranking per practice, and replace this benchmark list with measured
   data.
