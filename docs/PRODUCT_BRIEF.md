# MedMKP Product Brief

## Wedge

MedMKP is a concierge procurement marketplace for medical offices. The first target is dental practices and DSOs because the supplies are frequently purchased, fragmented across vendors, and painful to compare.

The buyer promise:

- Upload a catalog, invoice, reorder list, or free-form supply need.
- See the best-value option for each product category.
- Choose whether they need the exact brand or will accept flexible alternatives.
- Submit one concierge request instead of chasing scattered suppliers.

The supplier promise:

- Create an account and upload a catalog/SKU list with minimal manual entry.
- Publish offers with price, inventory, shipping estimate, and certifications.
- Receive qualified B2B demand from clinics.

## Starting ICP

1. Dental
   - Frequently purchased consumables and operatory supplies.
   - Fragmented distributor landscape with large price spreads.
2. PT / Chiro / Rehab
   - Later wedge. Lower-regulation Type I style products.
3. CPAP
   - Later wedge. More regulatory and product-fit complexity.

## First Supply Vertical

Onboard 10-15 suppliers via Thomasnet and direct outreach.

Start with dental practices and aim for renewable, reorder-heavy products where practices already buy repeatedly:

- Gloves and masks.
- Patient bibs and barriers.
- Prophy paste and angles.
- Burs.
- Impression material.
- Anesthetics and needles.
- Disinfectant wipes.
- Cotton rolls and gauze.
- Saliva ejectors and HVE tips.
- Sterilization pouches.

Avoid injectables, Class II/III medical devices, and other higher-regulation products in v1.

## Core Workflows

Sean's sketch frames the v1 as a concierge/incubation-to-marketplace loop:

```text
Buyer uploads anything
  -> Admin parses SKUs
  -> Admin sends RFQs to suppliers
  -> Supplier responds through email or quote link
  -> Admin builds buyer quote chart
  -> Buyer approves and pays
  -> Admin places supplier order
  -> Supplier ships
  -> Buyer receives tracking and reorder reminder
```

```text
Buyer need upload -> Product/category extraction -> Supplier offer matching
                  -> Best-value recommendation -> Concierge buy request
```

```text
Supplier catalog upload -> SKU parsing -> Canonical product mapping
                        -> Vetting/certification check -> Live offers
```

Upload intake should accept messy buyer inputs:

- PDF invoices and PDF orders.
- Conventional CSV/XLSX exports.
- Photos or screenshots of invoices, packing slips, and reorder lists.
- Forwarded emails.
- Images/photos from the back office.

Normalized line-item fields:

- Invoice number.
- Vendor name.
- Invoice date.
- Buyer name.
- Shipping address.
- Line item description.
- Supplier SKU.
- Manufacturer SKU.
- Brand/manufacturer.
- Quantity.
- Unit of measure.
- Pack size.
- Unit price.
- Extended price.
- Shipping/freight.
- Order date.
- Delivery date.
- Notes.

The normalization goal is to turn messy procurement artifacts into comparable price rows.

```text
Messy upload -> Extract fields -> Normalize price/unit/pack -> Quote chart -> Best-value pick
```

## MVP Screen Scope

Sean's sketch lists six MVP screens total:

1. Landing page.
2. Invoice upload form.
3. Admin dashboard.
4. Quote builder.
5. Buyer quote approval page.
6. Order status page.

Explicitly out of scope for the first version:

- Supplier profiles.
- Product reviews.
- Public product browsing.
- Promotions.
- Supplier analytics.
- Full vendor dashboard.
- Marketplace search.
- Complex product pages.
- Self-service catalog uploads.

This implies v1 should feel less like a self-serve Amazon clone and more like a procurement concierge with enough software to make the concierge workflow repeatable.

## Marketplace Model

This is closer to Amazon Business plus concierge procurement than pure drop-shipping.

- Suppliers create their own accounts.
- Buyers can search or upload needs.
- MedMKP normalizes products so buyers compare comparable offers.
- Buyer pays supplier, MedMKP takes commission.
- Stripe ACH is preferred for lower B2B payment cost. Stripe Connect can support payouts and commission tracking. Plaid may help later for bank/account verification.
- Early pricing can be a procurement/reorder platform fee for small healthcare operators, with commission routed only once orders move through MedMKP.

## Matching Criteria

Best value is not only lowest price. Rank offers by:

- Cost of item.
- Supplier reliability.
- Inventory availability.
- Shipping estimate.
- Exact brand requirement versus acceptable alternative.
- Certification/vetting status.
- Prior buyer reorder history.

## Supplier Vetting

Minimum supplier profile:

- EIN.
- Certifications.
- Product categories served.
- Shipping regions and estimated delivery windows.
- Inventory feed or inventory estimate policy.
- Portal/API/catalog upload method.

Potential supplier sourcing:

- Public dental distributor catalogs (Dental City, Net32, Safco, Darby, Pearson).
- Direct outreach to dental-supply distributors.

## Product Architecture Implication

The system should separate canonical products from seller offers:

```text
Supplier SKU -> Canonical Product -> Comparable Offer -> Best Value Match -> Buy Request
```

This lets one product category show multiple comparable offers without flooding buyers with duplicate SKUs.

## Open Questions

- Do suppliers have portals/APIs, or will most start with catalog uploads?
- How fresh does inventory need to be for v1: live count, daily estimate, or supplier-confirmed after request?
- Should v1 route approved orders to ACH/Stripe checkout immediately, or should admin still place orders manually while demand is being proven?
- What product categories produce the fastest first ten supplier conversations?
- What non-binding LOI language should clinics sign before implementation?
- What HIPAA posture is required if the platform avoids patient data entirely?
