// Deterministic two-device simulation of the reorder-list cross-device sync.
// Replays the exact sequences that were failing (scan -> see, delete -> see,
// clear -> empty) plus concurrency, driving the REAL client merge
// (app/reorderMerge.js) and the REAL server merge
// (medusa-backend/.../reorder-list/merge.ts), and asserts the two agree.
//
// Run from the repo root:  node test/reorder-sync-sim.mjs
//
// Models: a server whose PUT merges and whose GET supports ?since; two clients
// that write optimistically and poll. No browser, no debounce — just the merge
// logic and the poll/save loop, so "it syncs" is provable before deploy.

import { mergeDraftState, mergeDraftItems as clientMergeItems } from "../app/reorderMerge.js"
import { mergeReorderState, mergeDraftItems as serverMergeItems } from "../medusa-backend/apps/backend/src/api/medmkp/reorder-list/merge.ts"
import assert from "node:assert"

const T = Date.now()
let n = 0
const ok = (s) => { n++; console.log("  ✓ " + s) }
const active = (blob) => (blob?.draftItems || []).filter((i) => i.included !== false).map((i) => i.product).sort()
const scan = (p, ts) => ({ id: "li_" + p, barcode: "BC-" + p, extractedFrom: "Scanned · BC-" + p, product: p, included: true, updatedAt: ts, draftQty: 1 })

// ---- Simulated server: PUT merges (real server merge); GET supports ?since ----
const server = { state: null, version: 0 }
const serverPut = (blob) => { server.state = mergeReorderState(server.state || {}, blob); server.version++ }
const serverGet = (since) => (since && since === String(server.version))
  ? { unchanged: true, updated_at: String(server.version) }
  : { state: server.state, updated_at: String(server.version) }
const reset = () => { server.state = null; server.version = 0 }

// ---- Simulated client: local blob + optimistic save + poll (real client merge) ----
class Client {
  constructor() { this.local = { draftItems: [] }; this.version = null }
  save() { serverPut(this.local) }
  poll() { const d = serverGet(this.version); if (d.unchanged || !d.state) return; this.version = d.updated_at; this.local = mergeDraftState(this.local, d.state) }
  mutate(fn) { this.local = { ...this.local, draftItems: fn(this.local.draftItems || []) }; this.save() }
}

// 1) A scans 7 on mobile -> B (desktop) polls -> sees all 7
{ reset(); const A = new Client(), B = new Client()
  for (let i = 1; i <= 7; i++) A.mutate((items) => [...items, scan("P" + i, T + i)])
  B.poll()
  assert.strictEqual(active(B.local).length, 7); ok("scan 7 on A -> B poll sees 7") }

// 2) A deletes one -> B polls -> sees 6 (the deleted one gone)
{ const A = new Client(), B = new Client(); B.poll(); A.poll()
  A.mutate((items) => items.map((it) => it.barcode === "BC-P3" ? { ...it, included: false, updatedAt: T + 100 } : it))
  B.poll()
  assert.deepStrictEqual(active(B.local), ["P1", "P2", "P4", "P5", "P6", "P7"]); ok("delete 1 on A -> B poll sees 6") }

// 3) A clears -> B polls -> sees empty
{ const A = new Client(), B = new Client(); A.poll(); B.poll()
  A.mutate((items) => items.map((it) => it.included === false ? it : { ...it, included: false, updatedAt: T + 200 }))
  B.poll()
  assert.deepStrictEqual(active(B.local), []); ok("clear on A -> B poll sees empty") }

// 4) Concurrent adds on both devices -> converge, nothing lost
{ reset(); const A = new Client(), B = new Client()
  A.mutate((items) => [...items, scan("X", T + 1)])
  B.mutate((items) => [...items, scan("Y", T + 2)])
  A.poll(); B.poll()
  assert.deepStrictEqual(active(A.local), ["X", "Y"]); assert.deepStrictEqual(active(B.local), ["X", "Y"]); ok("concurrent add X/Y -> both see {X,Y}") }

// 5) Concurrent remove(later) vs stale edit(earlier) -> later wins (removed)
{ reset(); const A = new Client(), B = new Client()
  A.mutate((items) => [...items, scan("Z", T + 1)]); A.poll(); B.poll()
  A.mutate((items) => items.map((it) => ({ ...it, included: false, updatedAt: T + 10 })))
  B.mutate((items) => items.map((it) => ({ ...it, draftQty: 9, updatedAt: T + 5 })))
  A.poll(); B.poll()
  assert.deepStrictEqual(active(A.local), []); assert.deepStrictEqual(active(B.local), []); ok("remove(T+10) beats stale edit(T+5) -> Z removed") }

// 6) Re-add strictly later than a remove -> item comes back
{ reset(); const A = new Client(), B = new Client()
  A.mutate((items) => [...items, scan("W", T + 1)]); A.poll(); B.poll()
  A.mutate((items) => items.map((it) => ({ ...it, included: false, updatedAt: T + 10 })))
  B.mutate((items) => items.map((it) => ({ ...it, included: true, updatedAt: T + 20 })))
  A.poll(); B.poll()
  assert.deepStrictEqual(active(A.local), ["W"]); assert.deepStrictEqual(active(B.local), ["W"]); ok("re-add(T+20) after remove(T+10) -> W present") }

// 7) Parity: client and server item-merge agree (no drift between the two copies)
{ const now = T
  const cases = [
    [[scan("A", now)], []],
    [[scan("A", now)], [scan("A", now + 1)]],
    [[{ ...scan("A", now), included: false }], [scan("A", now)]],
    [[scan("A", now), scan("B", now)], [scan("A", now)]],
    [[{ id: "x", barcode: "B", included: false }], [{ id: "x", barcode: "B", included: true }]],
  ]
  for (const [e, i] of cases) {
    const c = clientMergeItems(e, i, now).filter((x) => x.included !== false).map((x) => x.product || x.barcode).sort()
    const s = serverMergeItems(e, i, now).filter((x) => x.included !== false).map((x) => x.product || x.barcode).sort()
    assert.deepStrictEqual(c, s)
  }
  ok("client merge == server merge (parity, no drift)") }

console.log(`\nALL ${n} SCENARIOS PASSED`)
