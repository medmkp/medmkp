import { mergeReorderState, mergeDraftItems, itemKey, TOMBSTONE_TTL_MS } from "../merge"

// updatedAt is a real epoch (Date.now()) in production, so anchor fixtures near
// "now" — otherwise tiny timestamps look decades old and get GC'd as expired
// tombstones, which is exactly the GC behaviour but not what these cases test.
const T = Date.now()

// Items are keyed on lifecycle-stable fields (barcode||extractedFrom||sku||id),
// so the helper gives each a stable barcode — that is how "the same item" on two
// devices, or before vs after a match, shares one merge bucket.
const item = (over: Record<string, any> = {}) => ({
  id: over.id ?? `li_${over.barcode ?? over.product ?? "x"}`,
  barcode: over.barcode ?? `BC-${over.product ?? "x"}`,
  product: over.product ?? "Composite A",
  draftQty: 1,
  included: true,
  updatedAt: T,
  ...over,
})

const draft = (existing: any, incoming: any) => (mergeReorderState(existing, incoming) as any).draftItems
const visible = (items: any[]) => items.filter((i) => i.included !== false).map((i) => i.product).sort()

describe("reorder-list merge", () => {
  // Sean's bug: a stale tab's blind whole-blob PUT must not wipe items another
  // device just scanned. Absence from the incoming blob is not a deletion.
  it("a stale/empty blob cannot wipe freshly scanned items", () => {
    const existing = {
      draftItems: [
        item({ product: "Gloves", barcode: "g" }),
        item({ product: "Masks", barcode: "m" }),
        item({ product: "Gauze", barcode: "z" }),
      ],
    }
    const incoming = { draftItems: [] } // long-open tab that never saw the scans
    expect(visible(draft(existing, incoming))).toEqual(["Gauze", "Gloves", "Masks"])
  })

  // Patrice's bug: a stale device that still remembers cleared items must not
  // resurrect them. The server-side tombstone always beats the stale visible copy.
  it("a tombstone is not resurrected by a stale included:true copy", () => {
    const existing = { draftItems: [item({ barcode: "B", included: false, updatedAt: T })] }
    const incoming = { draftItems: [item({ barcode: "B", included: true, updatedAt: T - 5000 })] }
    const merged = draft(existing, incoming)
    expect(merged).toHaveLength(1)
    expect(merged[0].included).toBe(false)
  })

  // A clear/remove on one device propagates: a fresher tombstone removes the item.
  it("a fresher tombstone removes an item that was included", () => {
    const existing = { draftItems: [item({ barcode: "B", included: true, updatedAt: T - 5000 })] }
    const incoming = { draftItems: [item({ barcode: "B", included: false, updatedAt: T })] }
    expect(visible(draft(existing, incoming))).toEqual([])
  })

  it("absence does not delete: an item only on the server survives", () => {
    const existing = { draftItems: [item({ product: "A", barcode: "a" }), item({ product: "B", barcode: "b" })] }
    const incoming = { draftItems: [item({ product: "A", barcode: "a" })] }
    expect(visible(draft(existing, incoming))).toEqual(["A", "B"])
  })

  it("newest edit wins for a shared item", () => {
    const existing = { draftItems: [item({ barcode: "B", draftQty: 1, updatedAt: T - 5000 })] }
    const incoming = { draftItems: [item({ barcode: "B", draftQty: 9, updatedAt: T })] }
    expect(draft(existing, incoming)[0].draftQty).toBe(9)
  })

  // Key stability: matching an unmatched scan fills in `product`, which must NOT
  // change the item's merge key — otherwise the pre-match and post-match copies
  // look like two items and the row duplicates after one sync round-trip.
  it("matching an unmatched item (product null -> set) does not split it", () => {
    const existing = { draftItems: [{ id: "i1", barcode: "B", included: true, updatedAt: T - 5000 }] }
    const incoming = { draftItems: [{ id: "i1", barcode: "B", product: "Gloves", included: true, updatedAt: T }] }
    const merged = draft(existing, incoming)
    expect(merged).toHaveLength(1)
    expect(merged[0].product).toBe("Gloves")
    expect(itemKey(merged[0])).toBe("B")
  })

  // An invoice line (no barcode) keyed on its immutable source text is likewise
  // stable across a later manual match.
  it("matching a no-barcode invoice line keyed by extractedFrom does not split it", () => {
    const existing = { draftItems: [{ id: "i2", extractedFrom: "NITRILE GLOVES LG", included: true, updatedAt: T - 5000 }] }
    const incoming = { draftItems: [{ id: "i2", extractedFrom: "NITRILE GLOVES LG", product: "Gloves", included: true, updatedAt: T }] }
    expect(draft(existing, incoming)).toHaveLength(1)
  })

  // The scenario Patrice called out: removed on one device, re-added on another.
  describe("remove on one device, re-add on the other", () => {
    it("converges to removed when the removal is the later action", () => {
      const desktopReadd = { draftItems: [item({ barcode: "B", included: true, updatedAt: T - 1000 })] }
      const mobileRemove = { draftItems: [item({ barcode: "B", included: false, updatedAt: T })] }
      expect(visible(draft(desktopReadd, mobileRemove))).toEqual([])
      expect(visible(draft(mobileRemove, desktopReadd))).toEqual([]) // order-independent
    })
    it("converges to present when the re-add is the later action", () => {
      const mobileRemove = { draftItems: [item({ product: "Bib", barcode: "B", included: false, updatedAt: T - 1000 })] }
      const desktopReadd = { draftItems: [item({ product: "Bib", barcode: "B", included: true, updatedAt: T })] }
      expect(visible(draft(mobileRemove, desktopReadd))).toEqual(["Bib"])
      expect(visible(draft(desktopReadd, mobileRemove))).toEqual(["Bib"]) // order-independent
    })
  })

  // A deletion must be sticky on a timestamp TIE — otherwise a stale device that
  // re-sends the pre-delete copy (e.g. a legacy/old-bundle item with no
  // updatedAt, so both sides read as 0) could resurrect a removed item.
  describe("deletion is sticky on a timestamp tie", () => {
    it("an equal-timestamp active copy cannot resurrect a tombstone (legacy zero-ts)", () => {
      const serverTombstone = { draftItems: [{ id: "x", barcode: "B", included: false }] } // updatedAt absent -> 0
      const staleActiveResave = { draftItems: [{ id: "x", barcode: "B", included: true }] } // updatedAt absent -> 0
      expect(visible(draft(serverTombstone, staleActiveResave))).toEqual([])
      expect(visible(draft(staleActiveResave, serverTombstone))).toEqual([]) // order-independent
    })
    it("an equal-timestamp active copy cannot resurrect a tombstone (same non-zero ts)", () => {
      const tomb = { draftItems: [item({ barcode: "B", included: false, updatedAt: T })] }
      const active = { draftItems: [item({ barcode: "B", included: true, updatedAt: T })] }
      expect(visible(draft(tomb, active))).toEqual([])
      expect(visible(draft(active, tomb))).toEqual([])
    })
    it("a strictly newer re-add still wins over a tombstone (re-add not blocked)", () => {
      const tomb = { draftItems: [item({ product: "Bib", barcode: "B", included: false, updatedAt: T })] }
      const readd = { draftItems: [item({ product: "Bib", barcode: "B", included: true, updatedAt: T + 1 })] }
      expect(visible(draft(tomb, readd))).toEqual(["Bib"])
      expect(visible(draft(readd, tomb))).toEqual(["Bib"])
    })
  })

  it("the same barcode scanned on two devices merges to one row (no duplicate)", () => {
    const phone = { draftItems: [item({ product: "Gloves", barcode: "B", id: "phone" })] }
    const desk = { draftItems: [item({ product: "Gloves", barcode: "B", id: "desk", updatedAt: T + 1 })] }
    expect(draft(phone, desk)).toHaveLength(1)
  })

  describe("tombstone garbage collection", () => {
    const now = 1_700_000_000_000
    it("drops expired tombstones but keeps active items and recent tombstones", () => {
      const items = [
        item({ product: "Active", barcode: "a", included: true, updatedAt: now }),
        item({ product: "RecentlyRemoved", barcode: "r", included: false, updatedAt: now - 1000 }),
        item({ product: "LongGone", barcode: "l", included: false, updatedAt: now - TOMBSTONE_TTL_MS - 1 }),
      ]
      expect(mergeDraftItems(items as any, [], now).map((i) => i.product).sort()).toEqual([
        "Active",
        "RecentlyRemoved",
      ])
    })

    it("keeps legacy tombstones (updatedAt 0) rather than GC-ing them immediately", () => {
      const items = [{ barcode: "leg", included: false }]
      expect(mergeDraftItems(items as any, [], now)).toHaveLength(1)
    })
  })

  it("converges regardless of merge order (commutative on the active set)", () => {
    const server = { draftItems: [item({ product: "A", barcode: "ba", updatedAt: T - 2000 })] }
    const phone = { draftItems: [item({ product: "B", barcode: "bb", updatedAt: T - 1000 })] }
    const desk = { draftItems: [item({ product: "A", barcode: "ba", included: false, updatedAt: T })] } // removes A
    const order1 = mergeReorderState(mergeReorderState(server, phone), desk)
    const order2 = mergeReorderState(mergeReorderState(server, desk), phone)
    expect(visible((order1 as any).draftItems)).toEqual(["B"])
    expect(visible((order2 as any).draftItems)).toEqual(["B"])
  })

  it("unions docs, archived lists and handoffs by id without losing either side", () => {
    const existing = {
      draftItems: [],
      uploadedDocs: [{ id: "scan", name: "Scans" }],
      archivedLists: [{ id: "L1" }],
      handoffs: [{ id: "H1" }],
    }
    const incoming = {
      draftItems: [],
      uploadedDocs: [{ id: "catalog", name: "Catalog" }],
      archivedLists: [{ id: "L2" }],
      handoffs: [{ id: "H2" }],
    }
    const merged = mergeReorderState(existing, incoming) as any
    expect(merged.uploadedDocs.map((d: any) => d.id).sort()).toEqual(["catalog", "scan"])
    expect(merged.archivedLists.map((l: any) => l.id).sort()).toEqual(["L1", "L2"])
    expect(merged.handoffs.map((h: any) => h.id).sort()).toEqual(["H1", "H2"])
  })

  it("preserves last-write-wins for scalar prefs", () => {
    const existing = { draftItems: [], listName: "Old", listStage: "draft" }
    const incoming = { draftItems: [], listName: "New", listStage: "review" }
    const merged = mergeReorderState(existing, incoming) as any
    expect(merged.listName).toBe("New")
    expect(merged.listStage).toBe("review")
  })
})
