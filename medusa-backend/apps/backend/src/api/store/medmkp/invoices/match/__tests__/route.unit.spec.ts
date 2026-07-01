import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POST } from "../route"

// Verifies the paid-tier gate is wired into the invoice-match POST: with
// BILLING_ENFORCE off the request passes the gate and reaches body validation
// (REGRESSION guard — matching must stay free for authed callers while dark);
// with the flag on an unentitled practice gets a 402 before any matching runs.
// Auth itself (anon → 401) is enforced by middleware and covered separately.

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

describe("POST /medmkp/invoices/match — paid-tier gate", () => {
  const prev = process.env.BILLING_ENFORCE
  afterEach(() => {
    if (prev === undefined) delete process.env.BILLING_ENFORCE
    else process.env.BILLING_ENFORCE = prev
  })

  it("with BILLING_ENFORCE off, passes the gate and validates the body (free while dark)", async () => {
    delete process.env.BILLING_ENFORCE
    const res = makeRes()
    // Empty line_items → the handler's own 400, proving it got past the gate.
    await POST(makeReq(makeService(), { body: { line_items: [] } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/line_items/)
  })

  it("with BILLING_ENFORCE on, 402s an unentitled practice before matching", async () => {
    process.env.BILLING_ENFORCE = "true"
    const res = makeRes()
    await POST(makeReq(makeService(undefined), { body: { line_items: [] } }), res)
    expect(res.statusCode).toBe(402)
  })
})
