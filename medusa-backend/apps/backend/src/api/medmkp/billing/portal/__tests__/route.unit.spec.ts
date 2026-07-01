import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Fake Stripe billing-portal session create, injected via the billing helpers.
const createSession = jest.fn(async ({ return_url }: any) => ({
  url: `https://billing.stripe.com/session?return=${encodeURIComponent(return_url)}`,
}))
jest.mock("../../../../../utils/billing", () => ({
  stripeConfigured: jest.fn(() => true),
  getStripe: jest.fn(() => ({ billingPortal: { sessions: { create: createSession } } })),
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
  customerId = "cus_1" as string | null,
  practiceId = "prac_1" as string | null,
  stripeCustomer = "cus_stripe" as string | null,
  body = { return_url: "https://app.tracedds.com/settings/billing" } as any,
} = {}) {
  const service = {
    listPracticeSubscriptions: jest.fn(async () =>
      stripeCustomer ? [{ id: "mps_1", stripe_customer_id: stripeCustomer }] : [{ id: "mps_1" }]
    ),
  }
  const knex = makeKnex(practiceId)
  const resolve = (token: string) =>
    token === ContainerRegistrationKeys.PG_CONNECTION ? knex : service
  return {
    auth_context: customerId ? { actor_id: customerId } : undefined,
    scope: { resolve },
    headers: {},
    body,
  } as any
}

function makeRes() {
  const res: any = { statusCode: 200 }
  res.status = (c: number) => ((res.statusCode = c), res)
  res.json = (p: any) => ((res.body = p), res)
  return res
}

describe("POST /medmkp/billing/portal", () => {
  beforeEach(() => {
    createSession.mockClear()
    mockConfigured.mockReset().mockReturnValue(true)
  })

  it("returns { url } for a practice with a Stripe customer", async () => {
    const res = makeRes()
    await POST(makeReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.url).toMatch(/^https:\/\/billing\.stripe\.com\/session/)
    expect(createSession).toHaveBeenCalledWith({
      customer: "cus_stripe",
      return_url: "https://app.tracedds.com/settings/billing",
    })
  })

  it("falls back to the Origin header when no return_url in the body", async () => {
    const res = makeRes()
    const req = makeReq({ body: {} })
    req.headers.origin = "https://app.tracedds.com"
    await POST(req, res)
    expect(res.statusCode).toBe(200)
    expect(createSession).toHaveBeenCalledWith({
      customer: "cus_stripe",
      return_url: "https://app.tracedds.com",
    })
  })

  it("401s an unauthenticated caller", async () => {
    const res = makeRes()
    await POST(makeReq({ customerId: null }), res)
    expect(res.statusCode).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it("409s a practice with no Stripe billing account yet", async () => {
    const res = makeRes()
    await POST(makeReq({ stripeCustomer: null }), res)
    expect(res.statusCode).toBe(409)
    expect(createSession).not.toHaveBeenCalled()
  })

  it("503s when Stripe is not configured", async () => {
    mockConfigured.mockReturnValue(false)
    const res = makeRes()
    await POST(makeReq(), res)
    expect(res.statusCode).toBe(503)
    expect(createSession).not.toHaveBeenCalled()
  })
})
