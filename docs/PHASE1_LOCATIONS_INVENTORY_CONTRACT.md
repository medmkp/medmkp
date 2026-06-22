# Phase 1 Contract — Locations + Inventory

**Status:** Authoritative for Phase 1. Backend, Locations UI, Office Layout, and QR-label
work all build against this. Change it here first if the model needs to evolve.

The spine of the TraceDDS pivot: physical **locations** in a practice, each holding
**inventory items** (a matched catalog product, counted, with traceability fields). Reuses
the existing catalog/matching backbone — an inventory item *is* a `canonical_product`,
placed and counted. Low volume per practice (~10 locations, hundreds of items).

## Data models (Medusa `medmkp` module, new tables)

### `location`
| field | type | notes |
|---|---|---|
| `id` | string PK | `loc_` prefix |
| `practice_id` | string FK → dental_practice | scoping; required |
| `name` | string | "Hygiene Cabinet", "Operatory 1" |
| `type` | enum | `cabinet` \| `operatory` \| `sterilization` \| `lab` \| `storage` \| `emergency_kit` \| `other` |
| `qr_code` | string, unique | opaque token printed as the cabinet QR; scanning it opens the location |
| `layout_x` | number \| null | Office Layout grid column (null = unplaced) |
| `layout_y` | number \| null | Office Layout grid row |
| `notes` | string \| null | |
| `created_by` | string \| null | user/buyer id (attribution; no roles UI yet) |
| `updated_by` | string \| null | |
| `created_at` / `updated_at` | timestamp | |

### `inventory_item`
| field | type | notes |
|---|---|---|
| `id` | string PK | `inv_` prefix |
| `location_id` | string FK → location | required |
| `canonical_product_id` | string \| null | link to `medmkp_canonical_product` (the matched identity) |
| `supplier_product_id` | string \| null | the specific SKU, if known |
| `name` | string | denormalized product name for display |
| `quantity_on_hand` | number | default 0 |
| `par_level` | number \| null | reorder threshold |
| `shelf_area` | string \| null | e.g. "Top shelf" |
| `lot_number` | string \| null | traceability |
| `expiration_date` | date (ISO) \| null | traceability |
| `package_condition` | enum \| null | `good` \| `damaged` \| `missing` |
| `photo_url` | string \| null | **column now, upload deferred to Phase 3 (object storage)** |
| `last_counted_at` | timestamp \| null | |
| `counted_by` | string \| null | attribution |
| `created_at` / `updated_at` | timestamp | |

## REST API (`/medmkp/*`, authed + practice-scoped, same pattern as reorder-list)

| method | path | body / returns |
|---|---|---|
| GET | `/medmkp/locations` | → `{ locations: Location[] }` — each with derived `item_count`, `needs_attention_count` |
| POST | `/medmkp/locations` | `{ name, type, notes?, layout_x?, layout_y? }` → `{ location }` (server mints `qr_code`) |
| GET | `/medmkp/locations/:id` | → `{ location, items: InventoryItem[] }` |
| PATCH | `/medmkp/locations/:id` | partial Location (incl. `layout_x/y`) → `{ location }` |
| DELETE | `/medmkp/locations/:id` | guarded: 409 if it still has inventory unless `?force=1` |
| PATCH | `/medmkp/locations/layout` | `{ positions: [{id, layout_x, layout_y}] }` → `{ ok }` — bulk save from Office Layout |
| GET | `/medmkp/locations/:id/inventory` | → `{ items: InventoryItem[] }` |
| POST | `/medmkp/locations/:id/inventory` | InventoryItem (sans id) → `{ item }` |
| PATCH | `/medmkp/inventory/:id` | partial InventoryItem → `{ item }` |
| DELETE | `/medmkp/inventory/:id` | → `{ ok }` |

Conventions: practice resolved from the session (like `/medmkp/me`, `/medmkp/reorder-list`);
422 on validation error; ISO-8601 dates; `needs_attention` = expired/expiring-soon OR
`quantity_on_hand <= par_level` OR missing lot/expiration.

## TypeScript shapes (for FE work — match exactly)

```ts
type LocationType = "cabinet" | "operatory" | "sterilization" | "lab" | "storage" | "emergency_kit" | "other";

interface Location {
  id: string;
  name: string;
  type: LocationType;
  qr_code: string;
  layout_x: number | null;
  layout_y: number | null;
  notes: string | null;
  item_count?: number;
  needs_attention_count?: number;
}

interface InventoryItem {
  id: string;
  location_id: string;
  canonical_product_id: string | null;
  supplier_product_id: string | null;
  name: string;
  quantity_on_hand: number;
  par_level: number | null;
  shelf_area: string | null;
  lot_number: string | null;
  expiration_date: string | null;   // ISO date
  package_condition: "good" | "damaged" | "missing" | null;
  photo_url: string | null;
  last_counted_at: string | null;
  counted_by: string | null;
}
```

## Mock data (use this in FE component demos)

```js
export const MOCK_LOCATIONS = [
  { id: "loc_hyg", name: "Hygiene Cabinet", type: "cabinet", qr_code: "TDDS-LOC-HYG01", layout_x: 1, layout_y: 0, notes: null, item_count: 37, needs_attention_count: 4 },
  { id: "loc_op1", name: "Operatory 1", type: "operatory", qr_code: "TDDS-LOC-OP1", layout_x: 0, layout_y: 1, notes: null, item_count: 18, needs_attention_count: 1 },
  { id: "loc_op2", name: "Operatory 2", type: "operatory", qr_code: "TDDS-LOC-OP2", layout_x: 1, layout_y: 1, notes: null, item_count: 21, needs_attention_count: 0 },
  { id: "loc_steri", name: "Sterilization", type: "sterilization", qr_code: "TDDS-LOC-STERI", layout_x: 2, layout_y: 1, notes: null, item_count: 12, needs_attention_count: 2 },
  { id: "loc_lab", name: "Lab", type: "lab", qr_code: "TDDS-LOC-LAB", layout_x: 2, layout_y: 0, notes: null, item_count: 9, needs_attention_count: 0 },
  { id: "loc_storage", name: "Storage", type: "storage", qr_code: "TDDS-LOC-STORE", layout_x: 3, layout_y: 1, notes: null, item_count: 64, needs_attention_count: 3 },
  { id: "loc_kit", name: "Emergency Kit", type: "emergency_kit", qr_code: "TDDS-LOC-KIT", layout_x: 0, layout_y: 0, notes: null, item_count: 8, needs_attention_count: 1 },
];
```

## Slice ownership
- **1a** backend models + migrations + routes — main thread
- **1b** Locations UI (Board / Add-Edit / Detail + inventory) — main thread
- **1c** Office Layout editor — parallel agent (self-contained component)
- **1d** QR label generator — parallel agent (self-contained component)

FE slices (1c/1d) ship **self-contained components** and do **not** wire into `app/page.jsx`
nav/routing — the main thread integrates them to avoid collisions on that file.
