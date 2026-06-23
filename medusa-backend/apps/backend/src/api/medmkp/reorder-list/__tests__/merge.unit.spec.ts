import { mergeReorderState, mergeDraftItems, TOMBSTONE_TTL_MS } from "../merge"

// updatedAt is a real epoch (Date.now()) in production, so anchor fixtures near
// "now" — otherwise tiny timestamps look decades old and get GC'd as expired
// tombstones, which is exactly the GC behaviour but not what these cases test.
const T = Date.now()

const item = (over: Record<string, any> = {}) => ({
  id: over.id ?? `li_${over.product ?? "x"}`,
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
        item({ product: "Gloves", id: "g" }),
        item({ product: "Masks", id: "m" }),
        item({ product: "Gauze", id: "z" }),
      ],
    }
    const incoming = { draftItems: [] } // long-open tab that never saw the scans
    expect(visible(draft(existing, incoming))).toEqual(["Gauze", "Gloves", "Masks"])
  })

  // Patrice's bug: a stale device that still remembers cleared items must not
  // resurrect them. The server-side tombstone always beats the stale visible copy.
  it("a tombstone is not resurrected by a stale included:true copy", () => {
    const existing = { draftItems: [item({ product: "Bib", id: "b", included: false, updatedAt: T })] }
    const incoming = { draftItems: [item({ product: "Bib", id: "b", included: true, updatedAt: T - 5000 })] }
    const merged = draft(existing, incoming)
    expect(merged).toHaveLength(1)
    expect(merged[0].included).toBe(false)
  })

  // A clear/remove on one device propagates: a fresher tombstone removes the item.
  it("a fresher tombstone removes an item that was included", () => {
    const existing = { draftItems: [item({ product: "Bib", included: true, updatedAt: T - 5000 })] }
    const incoming = { draftItems: [item({ product: "Bib", included: false, updatedAt: T })] }
    expect(visible(draft(existing, incoming))).toEqual([])
  })

  it("absence does not delete: an item only on the server survives", () => {
    const existing = { draftItems: [item({ product: "A" }), item({ product: "B" })] }
    const incoming = { draftItems: [item({ product: "A" })] }
    expect(visible(draft(existing, incoming))).toEqual(["A", "B"])
  })

  it("newest edit wins for a shared item", () => {
    const existing = { draftItems: [item({ product: "A", draftQty: 1, updatedAt: T - 5000 })] }
    const incoming = { draftItems: [item({ product: "A", draftQty: 9, updatedAt: T })] }
    expect(draft(existing, incoming)[0].draftQty).toBe(9)
  })

  it("a new scan from one device unions with the other device's list", () => {
    const existing = { draftItems: [item({ product: "A" })] }
    const incoming = { draftItems: [item({ product: "A" }), item({ product: "B", id: "newscan" })] }
    expect(visible(draft(existing, incoming))).toEqual(["A", "B"])
  })

  describe("tombstone garbage collection", () => {
    const now = 1_700_000_000_000
    it("drops expired tombstones but keeps active items and recent tombstones", () => {
      const items = [
        item({ product: "Active", included: true, updatedAt: now }),
        item({ product: "RecentlyRemoved", included: false, updatedAt: now - 1000 }),
        item({ product: "LongGone", included: false, updatedAt: now - TOMBSTONE_TTL_MS - 1 }),
      ]
      expect(mergeDraftItems(items as any, [], now).map((i) => i.product).sort()).toEqual([
        "Active",
        "RecentlyRemoved",
      ])
    })

    it("keeps legacy tombstones (updatedAt 0) rather than GC-ing them immediately", () => {
      const items = [{ product: "Legacy", included: false }]
      expect(mergeDraftItems(items as any, [], now).map((i) => i.product)).toEqual(["Legacy"])
    })
  })

  it("converges regardless of merge order (commutative on the active set)", () => {
    const server = { draftItems: [item({ product: "A", updatedAt: T - 2000 })] }
    const phone = { draftItems: [item({ product: "B", id: "p", updatedAt: T - 1000 })] }
    const desk = { draftItems: [item({ product: "A", id: "a", included: false, updatedAt: T })] } // removes A
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
