# GS1 Digital Link QR samples

QR codes encoding a **GS1 Digital Link** URL — the modern "QR on pack" form that
medical/dental UDI labels are migrating toward (GS1 "Sunrise 2027"). Each encodes:

```
https://id.gs1.org/01/<GTIN-14>/10/LOT2026
```

These exercise the QR path added to the scanner:
- Client: `qr_code` added to the iOS ponyfill formats ([app/ui.jsx](../../../app/ui.jsx));
  native Chrome/Android `BarcodeDetector` already decodes QR by default.
- Backend: `gs1Gtin()` now pulls AI 01 out of a Digital Link URL, not just
  GS1 element strings ([route.ts](../../../medusa-backend/apps/backend/src/api/medmkp/products/search/route.ts)).

## Verified end-to-end (live prod GTIN lookup)

| GTIN | Product |
|---|---|
| 00302730002188 | Young D-Lish 5% Fluoride Varnish Fresh Melon |
| 00348783005608 | Enamel Pro Varnish Clear Bubblegum |
| 00386040008788 | GC Fuji II LC Glass Ionomer Capsule |
| 00841396104206 | Herculite Ultra Unidose C4 Dentin |
| 00302730002669 | Defend Prophy Paste Medium Mint |

Chain: QR image → `zbarimg` decodes the Digital Link URL → `gs1Gtin()` extracts
the GTIN → catalog match. (Note: a *plain-digit* QR also works via `gtinVariants`;
Digital Link is the case that needed new parsing.)
