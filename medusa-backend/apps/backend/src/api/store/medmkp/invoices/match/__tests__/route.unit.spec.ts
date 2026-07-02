import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POST } from "../route"

// Invoice matching is a free authed feature: entitlement moved to cart-builds,
// while auth itself remains enforced by the /medmkp/invoices* middleware.

function makeService(sub?: { status: string }) {
  return { listPracticeSubscriptions: jest.fn(async () => (sub ? [sub] : [])) }
}

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

function makeReq(service: any, { body, practiceId = "prac_1" as string | null } = {} as any) {
  const knex = makeKnex(practiceId)
  const resolve = (token: string) =>
    token === ContainerRegistrationKeys.PG_CONNECTION ? knex : service
  return { auth_context: { actor_id: "cus_1" }, scope: { resolve }, body } as any
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

describe("POST /medmkp/invoices/match — free authed matching", () => {
  const prev = process.env.BILLING_ENFORCE
  afterEach(() => {
    if (prev === undefined) delete process.env.BILLING_ENFORCE
    else process.env.BILLING_ENFORCE = prev
  })

  it("with BILLING_ENFORCE on, proceeds for an unentitled practice and validates the body", async () => {
    process.env.BILLING_ENFORCE = "true"
    const service = makeService()
    const res = makeRes()
    // Empty line_items → the handler's own 400, proving it got past the gate.
    await POST(makeReq(service, { body: { line_items: [] } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/line_items/)
    expect(service.listPracticeSubscriptions).not.toHaveBeenCalled()
  })

  it("with BILLING_ENFORCE off, also proceeds to invoice-match validation", async () => {
    delete process.env.BILLING_ENFORCE
    const service = makeService()
    const res = makeRes()
    await POST(makeReq(service, { body: { line_items: [] } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/line_items/)
    expect(service.listPracticeSubscriptions).not.toHaveBeenCalled()
  })
})
