import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Mock the billing helpers so the read-through can be driven without Stripe.
jest.mock("../billing", () => ({
  getStripe: jest.fn(() => ({})),
  stripeConfigured: jest.fn(() => true),
  reconcilePracticeFromStripe: jest.fn(),
}))

import { assertEntitled } from "../practice"
import { reconcilePracticeFromStripe, stripeConfigured } from "../billing"

const mockReconcile = reconcilePracticeFromStripe as jest.Mock
const mockConfigured = stripeConfigured as jest.Mock

// The deny-path read-through: BILLING_ENFORCE on, the local row says not-entitled
// (a paying practice stale-locked because a webhook was missed), and a one-shot
// live Stripe read heals it to "active" so the request is allowed — no cron.

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

function makeReq(localStatus: string | undefined, practiceId: string | null = "prac_1") {
  const service = {
    listPracticeSubscriptions: jest.fn(async () => (localStatus ? [{ status: localStatus }] : [])),
  }
  const knex = makeKnex(practiceId)
  const resolve = (token: string) =>
    token === ContainerRegistrationKeys.PG_CONNECTION ? knex : service
  return { auth_context: { actor_id: "cus_1" }, scope: { resolve } } as any
}

function makeRes() {
  const res: any = { statusCode: 200 }
  res.status = (c: number) => ((res.statusCode = c), res)
  res.json = (p: any) => ((res.body = p), res)
  return res
}

describe("assertEntitled — deny-path read-through self-heal", () => {
  const prev = process.env.BILLING_ENFORCE
  beforeEach(() => {
    process.env.BILLING_ENFORCE = "true"
    mockReconcile.mockReset()
    mockConfigured.mockReset().mockReturnValue(true)
  })
  afterAll(() => {
    if (prev === undefined) delete process.env.BILLING_ENFORCE
    else process.env.BILLING_ENFORCE = prev
  })

  it("stale-locked but active in Stripe → read-through allows the request", async () => {
    // Local row is past_due (stale); Stripe says active.
    mockReconcile.mockResolvedValue({ sub: { status: "active" }, entitled: true, reconciled: true })
    const res = makeRes()

    const ok = await assertEntitled(makeReq("past_due"), res)

    expect(mockReconcile).toHaveBeenCalledTimes(1)
    expect(ok).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  it("still not active in Stripe → stays denied (402), read-through attempted once", async () => {
    mockReconcile.mockResolvedValue({ sub: { status: "canceled" }, entitled: false, reconciled: true })
    const res = makeRes()

    const ok = await assertEntitled(makeReq("canceled"), res)

    expect(mockReconcile).toHaveBeenCalledTimes(1)
    expect(ok).toBe(false)
    expect(res.statusCode).toBe(402)
  })

  it("already active locally → no Stripe read (fast path)", async () => {
    const res = makeRes()
    const ok = await assertEntitled(makeReq("active"), res)
    expect(mockReconcile).not.toHaveBeenCalled()
    expect(ok).toBe(true)
  })

  it("Stripe not configured → no read-through, stays denied", async () => {
    mockConfigured.mockReturnValue(false)
    const res = makeRes()
    const ok = await assertEntitled(makeReq("past_due"), res)
    expect(mockReconcile).not.toHaveBeenCalled()
    expect(ok).toBe(false)
    expect(res.statusCode).toBe(402)
  })

  it("a Stripe error in the read-through does not upgrade a deny into an allow", async () => {
    mockReconcile.mockRejectedValue(new Error("stripe down"))
    const res = makeRes()
    const ok = await assertEntitled(makeReq("past_due"), res)
    expect(ok).toBe(false)
    expect(res.statusCode).toBe(402)
  })
})
