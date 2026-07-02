Issue #625 scanner network evidence

Before (base 98a39ad):
- `/app` mobile scanner home requested `GET /api/locations` twice.
- `/app/scan-session?location=anything` requested `GET /api/locations` twice.

After (this branch):
- `/app` -> Start scanning -> Enter code `743842007546` requested only `GET /api/products/search?barcode=743842007546&limit=1` among scanner-relevant endpoints.
- `/app/scan-session?location=anything` rendered the add-to-list scanner.
- No requests matched `/medmkp/scans`, `/api/scans`, `/api/locations`, or `/api/needs-attention`.
