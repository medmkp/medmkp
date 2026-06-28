# MedMKP Demo Screen Handoff

These screens are visual references for the demo build, not pixel-perfect final designs.

## Implementation priority

1. Mobile scan lead magnet
2. Add/import items
3. Match review
4. Master reorder list
5. Reorder run
6. Supplier handoff/export
7. Mobile scan flow
8. Admin match/catalog screens

## Canonical screens

00 - Mobile scan lead magnet
Purpose: Public no-login CTA. User scans or enters SKU and sees possible savings.

01 - Dashboard
Purpose: Logged-in overview of reorder list, savings opportunities, pending reorder actions.

02 - Add / Import Items
Purpose: Lets user add items by invoice upload, SKU search, manual entry, or barcode scan.

03 - Match Review
Purpose: Confirms supplier/product matches before adding to reorder memory.

04 - Master Reorder List
Purpose: Main saved item list with reorder cadence, supplier, price benchmark, and alert badges.

05 - Reorder Run
Purpose: Creates a batch reorder draft from selected low-stock or due-soon items.

06 - Supplier Handoff
Purpose: Groups items by supplier and gives the user ordering/export steps.

07 - Admin Product Match Queue
Purpose: Internal QA screen for uncertain product matches.

08 - Admin Supplier Catalog & Price Evidence
Purpose: Internal catalog/evidence review for supplier product data.

09-11 - Mobile scan flow
Purpose: Mobile scan, confirm match, add to reorder list.

12 - Mobile alerts example
Purpose: Push notification / mobile alert reference.

## Notes

- Treat all alternates as reference only.
- Do not implement every variation.
- Visual style should follow the current MedMKP theme: clean white/blue, card-based, SaaS dashboard feel.
- Priority is demo believability, not full backend integration.
- Use mocked data where needed.
