TraceDDS Frame Usage Guide

Preferred presentation order:

1. Mobile Scan Mode: Receiving vs Shelf Audit

Start here. This frame explains the core split. The same scanner can create different records depending on context.

Receiving means: this product came into the office.

Shelf Audit means: this product was seen, moved, missing, or verified in an existing location.

This distinction matters because Receiving can build reorder history, while Shelf Audit should only update presence, location, and lifecycle status.

Adjustment: change “Add stock” to “Create intake record” or “New shipment intake.” Avoid language that implies perpetual inventory.

2. Mobile Receiving Scan: Lot + Expiry Capture

This is the main scanner-first value frame. It shows that a receiving scan captures product, lot, expiration, received date, location, and optional quantity received.

This creates two outputs:

Compliance evidence: product, lot, expiry, location, capture date.

Reorder signal: this product was received on this date.

Over time, repeated receiving scans become reorder history without requiring invoice upload.

Adjustment: keep “Quantity received” optional. Do not call it “Quantity on hand.” Also consider “Save receiving record” instead of “Save intake record.”

3. Mobile Shelf Audit Verification

This frame shows the second scan mode: verifying existing products. It should not look like adding inventory or counting stock.

Shelf Audit updates:

Last verified date.

Location.

Lifecycle status.

Evidence history.

The purpose is to confirm whether the lot is present, moved, not found, or removed.

Adjustment: “Expired” should probably not be a manually selected status. Expiration is derived from the expiration date. If the item is expired, the UI should show an issue banner: “Expired, verify removal or replacement.” The status buttons should probably be: Present, Moved, Not found, Removed.

4. Desktop Product / Lot Detail Drawer

This is the “source of truth” frame. It shows one lot/location record.

It should answer:

What product is this?

Which lot is it?

Where was it last verified?

When does it expire?

What is the lifecycle state?

What evidence is attached?

Is there a recall or expiry issue?

This frame should reinforce the data model: one record per lot per location, not one record per package.

Adjustment: avoid “Inventory / Compliance” as the parent label if possible. Better: “Product Compliance,” “Supply Evidence,” or “Lot & Expiry Records.”

5. Desktop Needs Attention, Compliance-first

This is the operations queue. It groups unresolved work: expired items, recall matches, missing SDS, stale verification, and reorder due.

This frame should make clear that compliance issues outrank reorder tasks. Expired and recalled items should be visually higher priority than reorder due.

Adjustment: change “inventory issues” to “lot, expiry, documentation, and reorder issues.” Reorder due should be present but secondary.

6. Desktop Reorder Basis Drawer

This frame explains reorder timing without pretending to know exact quantity.

It should show:

Likely reorder window.

Selected basis.

Why the system estimated that timing.

Data used.

Available alternatives.

The key point is: reorder timing is estimated from receiving history, order history, custom cadence, or opened-date estimate. It is not exact inventory.

Adjustment: remove any confidence score. Show basis and math instead.

7. Desktop Receiving History Becomes Reorder History

This is the bridge frame. It explains how scanner-first can support reorder without invoices.

Example:

CaviWipes received Jan 3.

CaviWipes received Feb 6.

CaviWipes received Mar 5.

Estimated reorder window: every 30-45 days.

This makes the logic clear: repeated receiving scans create cadence.

Adjustment: keep this as an explainer drawer or detail view, not necessarily a main screen.

Overall product logic:

Receiving scan creates evidence and starts reorder history.

Shelf Audit verifies presence and status.

Product / Lot Detail shows the record.

Needs Attention surfaces unresolved compliance work.

Reorder Basis explains estimated timing.

Receiving History proves reorder can work without invoices.

What not to imply:

Do not imply exact inventory counts.

Do not imply quantity on hand unless staff manually maintains it.

Do not require invoice upload.

Do not show confidence percentages.

Do not require per-use logging.

Do not make manual usage formulas the default.

Core framing:

TraceDDS is not default perpetual inventory. It is scanner-first product evidence plus lightweight reorder timing.

Scanning proves lot, expiry, location, and status.

Reorder improves over time from receiving scans, staff corrections, custom cadence, and optional order-history import.
