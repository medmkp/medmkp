import { reconcilePracticeFromStripe } from "../billing"

// Verifies the single reconcile path that self-heals a drifted subscription row.
// This is the "dropped-webhook" chaos guard: the local row is stale (a webhook
// was missed / delayed / out-of-order) while Stripe is the source of truth, and
// one live read brings the row back in line + stamps last_reconciled_at.

// Minimal in-memory stand-in for the medmkp module service: one subscription row
// that update mutates in place, so the test can assert the write happened.
function makeService(row: any) {
  const store = { row }
  return {
    store,
    listPracticeSubscriptions: jest.fn(async () => (store.row ? [store.row] : [])),
    updatePracticeSubscriptions: jest.fn(async (patch: any) => {
      store.row = { ...store.row, ...patch }
      return store.row
    }),
  } as any
}

function makeStripe(status: string, current_period_end?: number) {
  return {
    subscriptions: {
      retrieve: jest.fn(async (id: string) => ({ id, status, current_period_end })),
    },
  } as any
}

describe("reconcilePracticeFromStripe", () => {
  it("dropped-webhook chaos: stale local 'canceled' → Stripe 'active' heals the row", async () => {
    const svc = makeService({
      id: "mps_1",
      practice_id: "prac_1",
      status: "canceled", // stale: the activation webhook never landed
      stripe_subscription_id: "sub_live",
      last_reconciled_at: null,
    })
    const stripe = makeStripe("active", 1893456000) // 2030-01-01

    const before = await svc.listPracticeSubscriptions({ practice_id: "prac_1" })
    expect(before[0].status).toBe("canceled")

    const result = await reconcilePracticeFromStripe(svc, "prac_1", stripe)

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_live")
    expect(result.reconciled).toBe(true)
    expect(result.entitled).toBe(true)
    expect(svc.store.row.status).toBe("active")
    expect(svc.store.row.renews_at).toBe("2030-01-01T00:00:00.000Z")
    expect(svc.store.row.last_reconciled_at).toBeInstanceOf(Date)
  })

  it("reflects a cancel made in the portal: local 'active' → Stripe 'canceled'", async () => {
    const svc = makeService({
      id: "mps_2",
      practice_id: "prac_2",
      status: "active",
      stripe_subscription_id: "sub_gone",
    })
    const stripe = makeStripe("canceled")

    const result = await reconcilePracticeFromStripe(svc, "prac_2", stripe)

    expect(result.entitled).toBe(false)
    expect(svc.store.row.status).toBe("canceled")
  })

  it("no-op (no Stripe read) when the practice has no subscription id yet", async () => {
    const svc = makeService({ id: "mps_3", practice_id: "prac_3", status: "incomplete" })
    const stripe = makeStripe("active")

    const result = await reconcilePracticeFromStripe(svc, "prac_3", stripe)

    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
    expect(result.reconciled).toBe(false)
    expect(result.entitled).toBe(false)
  })
})
