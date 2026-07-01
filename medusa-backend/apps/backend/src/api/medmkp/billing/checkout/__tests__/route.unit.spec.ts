import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Stateful fake Stripe, injected via the billing helpers. customers.create honours
// the idempotency key (a repeated key replays the first customer, like Stripe), so
// the customer-reuse / concurrency behaviour is exercised without a live account.
let customerSeq = 0
const customersByKey = new Map<string, any>()
const createCustomer = jest.fn(async (params: any, opts: any = {}) => {
  const key = opts?.idempotencyKey
  if (key && customersByKey.has(key)) return customersByKey.get(key)
  const customer = { id: `cus_${++customerSeq}`, metadata: params?.metadata }
  if (key) customersByKey.set(key, customer)
  return customer
})
const createSession = jest.fn(async (params: any) => ({
  id: "cs_test_1",
  url: `https://checkout.stripe.com/c/pay/cs_test_1?customer=${params.customer}`,
}))
jest.mock("../../../../../utils/billing", () => ({
  stripeConfigured: jest.fn(() => true),
  getStripe: jest.fn(() => ({
    customers: { create: createCustomer },
    checkout: { sessions: { create: createSession } },
  })),
}))

import { POST } from "../route"
import { stripeConfigured } from "../../../../../utils/billing"

const mockConfigured = stripeConfigured as jest.Mock

function makeKnex(practiceId: string | null) {
  const qb: any = {
    select: () => qb,
    from: () => qb,
    where: () => qb,
    whereNull: () => qb,
    limit: async () => (practiceId ? [{ medmkp_dental_practice_id: practiceId }] : []),
  }
  return qb
}

function makeReq({
  customerId = "cus_actor" as string | null,
  practiceId = "prac_1" as string | null,
  // The subscription row's persisted Stripe customer id (null = never subscribed).
  stripeCustomer = null as string | null,
  body = { success_url: "https://app.tracedds.com/ok", cancel_url: "https://app.tracedds.com/no" } as any,
  origin = undefined as string | undefined,
} = {}) {
  const service = {
    listPracticeSubscriptions: jest.fn(async () =>
      stripeCustomer ? [{ id: "mps_1", stripe_customer_id: stripeCustomer }] : []
    ),
  }
  const knex = makeKnex(practiceId)
  const resolve = (token: string) =>
    token === ContainerRegistrationKeys.PG_CONNECTION ? knex : service
  return {
    auth_context: customerId ? { actor_id: customerId } : undefined,
    scope: { resolve },
    headers: origin ? { origin } : {},
    body,
  } as any
}

function makeRes() {
  const res: any = { statusCode: 200 }
  res.status = (c: number) => ((res.statusCode = c), res)
  res.json = (p: any) => ((res.body = p), res)
  return res
}

describe("POST /medmkp/billing/checkout", () => {
  beforeEach(() => {
    createCustomer.mockClear()
    createSession.mockClear()
    customersByKey.clear()
    customerSeq = 0
    mockConfigured.mockReset().mockReturnValue(true)
    process.env.STRIPE_PRICE_PRACTICE = "price_practice_test"
  })

  it("returns { url } for a fixed-price × 1 subscription session tagged with practice_id", async () => {
    const res = makeRes()
    await POST(makeReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//)

    // A customer was minted for a never-subscribed practice, tagged with the practice.
    expect(createCustomer).toHaveBeenCalledWith(
      { metadata: { practice_id: "prac_1" } },
      { idempotencyKey: "practice-checkout-customer:prac_1" }
    )
    // The session is a fixed price × 1 subscription, mapped back to the practice.
    const args = createSession.mock.calls[0][0]
    expect(args.mode).toBe("subscription")
    expect(args.line_items).toEqual([{ price: "price_practice_test", quantity: 1 }])
    expect(args.client_reference_id).toBe("prac_1")
    expect(args.metadata).toEqual({ practice_id: "prac_1" })
    expect(args.subscription_data).toEqual({ metadata: { practice_id: "prac_1" } })
    expect(args.customer).toBe("cus_1")
  })

  it("reuses the row's existing Stripe customer instead of creating one", async () => {
    const res = makeRes()
    await POST(makeReq({ stripeCustomer: "cus_existing" }), res)
    expect(res.statusCode).toBe(200)
    expect(createCustomer).not.toHaveBeenCalled()
    expect(createSession.mock.calls[0][0].customer).toBe("cus_existing")
  })

  it("a rapid second call reuses the same customer (idempotency key, no duplicate)", async () => {
    await POST(makeReq(), makeRes())
    await POST(makeReq(), makeRes())
    // Two checkout attempts, but only one distinct Stripe customer materialised.
    expect(createSession).toHaveBeenCalledTimes(2)
    expect(createSession.mock.calls[0][0].customer).toBe("cus_1")
    expect(createSession.mock.calls[1][0].customer).toBe("cus_1")
    expect(customersByKey.size).toBe(1)
  })

  it("derives success/cancel URLs from the Origin when the body omits them", async () => {
    const res = makeRes()
    await POST(makeReq({ body: {}, origin: "https://app.tracedds.com" }), res)
    expect(res.statusCode).toBe(200)
    const args = createSession.mock.calls[0][0]
    expect(args.success_url).toBe("https://app.tracedds.com/settings/billing?checkout=success")
    expect(args.cancel_url).toBe("https://app.tracedds.com/settings/billing?checkout=cancel")
  })

  it("401s an unauthenticated caller", async () => {
    const res = makeRes()
    await POST(makeReq({ customerId: null }), res)
    expect(res.statusCode).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it("404s a caller whose account is not linked to a practice", async () => {
    const res = makeRes()
    await POST(makeReq({ practiceId: null }), res)
    expect(res.statusCode).toBe(404)
    expect(createSession).not.toHaveBeenCalled()
  })

  it("503s when Stripe is not configured", async () => {
    mockConfigured.mockReturnValue(false)
    const res = makeRes()
    await POST(makeReq(), res)
    expect(res.statusCode).toBe(503)
    expect(createSession).not.toHaveBeenCalled()
  })

  it("503s when the Practice price id is unset", async () => {
    delete process.env.STRIPE_PRICE_PRACTICE
    const res = makeRes()
    await POST(makeReq(), res)
    expect(res.statusCode).toBe(503)
    expect(createSession).not.toHaveBeenCalled()
  })

  it("422s when no success/cancel URL can be resolved", async () => {
    const res = makeRes()
    await POST(makeReq({ body: {} }), res)
    expect(res.statusCode).toBe(422)
    expect(createSession).not.toHaveBeenCalled()
  })
})
