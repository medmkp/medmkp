import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { entitlement, assertEntitled } from "../practice"

// Exercises the paid-tier entitlement helpers against a stubbed medmkp module
// service (subscription read) and a stubbed practice-link knex query. Covers the
// active/canceled/past_due/no-row cases, the BILLING_ENFORCE flag, and the
// fail-closed-on-DB-error path.

const PRAC = "prac_1"

// medmkp.listPracticeSubscriptions(filter, opts) → newest-first rows for a practice.
function makeService(sub?: { status: string } | Error) {
  return {
    listPracticeSubscriptions: jest.fn(async () => {
      if (sub instanceof Error) throw sub
      return sub ? [sub] : []
    }),
  }
}

// resolvePracticeId reads the customer<->practice link via knex; stub the chain.
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

function makeReq(
  service: any,
  { actorId = "cus_1", practiceId = PRAC as string | null }: { actorId?: string | null; practiceId?: string | null } = {}
) {
  const knex = makeKnex(practiceId)
  const resolve = (token: string) =>
    token === ContainerRegistrationKeys.PG_CONNECTION ? knex : service
  return { auth_context: actorId ? { actor_id: actorId } : undefined, scope: { resolve } } as any
}

function makeRes() {
  const res: any = { statusCode: 200 }
  res.status = (c: number) => {
    res.statusCode = c
    return res
  }
  res.json = (p: any) => {
    res.body = p
    return res
  }
  return res
}

describe("entitlement()", () => {
  it("is entitled for an active subscription", async () => {
    await expect(entitlement(makeReq(makeService({ status: "active" })), PRAC)).resolves.toBe(true)
  })

  it("is not entitled for past_due, canceled, trialing, or no row", async () => {
    await expect(entitlement(makeReq(makeService({ status: "past_due" })), PRAC)).resolves.toBe(false)
    await expect(entitlement(makeReq(makeService({ status: "canceled" })), PRAC)).resolves.toBe(false)
    await expect(entitlement(makeReq(makeService({ status: "trialing" })), PRAC)).resolves.toBe(false)
    await expect(entitlement(makeReq(makeService(undefined)), PRAC)).resolves.toBe(false)
  })
})

describe("assertEntitled()", () => {
  const prev = process.env.BILLING_ENFORCE
  afterEach(() => {
    if (prev === undefined) delete process.env.BILLING_ENFORCE
    else process.env.BILLING_ENFORCE = prev
  })

  it("allows any authed caller when BILLING_ENFORCE is off, without reading the subscription", async () => {
    delete process.env.BILLING_ENFORCE
    const service = makeService(undefined) // no subscription
    const res = makeRes()
    await expect(assertEntitled(makeReq(service), res)).resolves.toBe(true)
    expect(res.statusCode).toBe(200)
    expect(service.listPracticeSubscriptions).not.toHaveBeenCalled()
  })

  it("402s an unentitled practice when BILLING_ENFORCE is on", async () => {
    process.env.BILLING_ENFORCE = "true"
    const res = makeRes()
    await expect(assertEntitled(makeReq(makeService(undefined)), res)).resolves.toBe(false)
    expect(res.statusCode).toBe(402)
  })

  it("allows an entitled practice when BILLING_ENFORCE is on", async () => {
    process.env.BILLING_ENFORCE = "true"
    const res = makeRes()
    await expect(assertEntitled(makeReq(makeService({ status: "active" })), res)).resolves.toBe(true)
    expect(res.statusCode).toBe(200)
  })

  it("fails closed (402) and logs when the subscription read throws", async () => {
    process.env.BILLING_ENFORCE = "true"
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    const res = makeRes()
    await expect(
      assertEntitled(makeReq(makeService(new Error("connection reset"))), res)
    ).resolves.toBe(false)
    expect(res.statusCode).toBe(402)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
