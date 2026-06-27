# Scanner-matched barcode images

Real web-served barcode images (PNG) that the tracedds scanner resolves to a
catalog product. Collected for later analysis of scan → product matching.

## How these were gathered

1. GTIN pool sourced from real dental products:
   - 10 seed GTINs (DC Dental `upccode`, multi-supplier) from the existing
     `test/barcodes/*.svg` set.
   - ~536 dental-device GTINs pulled from the openFDA UDI/GUDID API
     (`api.fda.gov/device/udi.json`) across common dental manufacturers
     (3M, Dentsply, Kerr, GC America, Premier, Ultradent, Hu-Friedy,
     Coltene, Septodont, Young Dental) — the same GUDID source the catalog's
     barcode enrichment came from.
2. Each GTIN was screened against the prod scanner endpoint
   `GET /tracedds/products/search?barcode=<gtin>`; 180/536 openFDA codes matched.
3. For each distinct matched product, a real barcode image was fetched from a
   public barcode rendering service (`barcodeapi.org`), then **verified**:
   decoded with `zbarimg` (same family as the app's ZXing path) and re-queried
   against the scanner. Only images that decode AND match are kept.

## Symbology

All images are **linear** barcodes the scanner actually supports
([app/ui.jsx](../../../app/ui.jsx) — `upc_a, upc_e, ean_13, ean_8, code_128,
code_39, data_matrix`; note the iOS Safari ponyfill path does **not** decode
QR). Distribution:

- 84 UPC-A / EAN-13 — retail-unit GTIN-12/13 codes.
- 21 Code-128 — GTIN-14 case codes (the route's `gtinVariants` width-folds
  these to the same product).

(An earlier pass used barcodeapi `/api/auto/`, which rendered most as QR — not
representative of a real product label — so they were regenerated as linear.)

## Contents

- 105 PNG barcode images, named `<gtin>_<product-slug>.png`.
- `MANIFEST.csv` — file, symbology, decoded GTIN, match kind (`barcode` exact /
  `substitute` / `hibc`), supplier offer count, matched product, category.

## Re-run the harness

```bash
../scan-and-match.sh <image.png>   # prints  MATCH|NOMATCH|NODECODE <file> <code> <product>
```
