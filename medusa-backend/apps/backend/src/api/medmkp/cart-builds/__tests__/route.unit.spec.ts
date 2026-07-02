import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { GET, POST } from "../route"

jest.mock("../../../../utils/billing", () => ({
  stripeConfigured: () => false,
  getStripe: jest.fn(),
  reconcilePracticeFromStripe: jest.fn(),
}))

const PRAC = "prac_1"

function makeService(sub?: { status: string }) {
  return {
    listPracticeSubscriptions: jest.fn(async () => (sub ? [sub] : [])),
    listCartBuildJobs: jest.fn(async () => [
      {
        id: "job_1",
        supplier_id: "sup_1",
        supplier_slug: "henry-schein",
        status: "queued",
      },
    ]),
    listSuppliers: jest.fn(async () => [{ id: "sup_1", slug: "henry-schein" }]),
    listSupplierCredentials: jest.fn(async () => [
      {
        id: "cred_1",
        practice_id: PRAC,
        supplier_id: "sup_1",
      },
    ]),
    createCartBuildJobs: jest.fn(async (jobs: any[]) => [
      {
        id: "job_2",
        supplier_id: jobs[0].supplier_id,
        supplier_slug: jobs[0].supplier_slug,
        status: jobs[0].status,
      },
    ]),
  }
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

function makeReq(
  service: any,
  {
    actorId = "cus_1",
    practiceId = PRAC as string | null,
    body,
    query = {},
  }: { actorId?: string | null; practiceId?: string | null; body?: any; query?: any } = {}
) {
  const knex = makeKnex(practiceId)
  const resolve = (token: string) =>
    token === ContainerRegistrationKeys.PG_CONNECTION ? knex : service
  return {
    auth_context: actorId ? { actor_id: actorId } : undefined,
    scope: { resolve },
    body,
    query,
  } as any
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

describe("GET /medmkp/cart-builds — entitlement gate", () => {
  const prev = process.env.BILLING_ENFORCE
  afterEach(() => {
    if (prev === undefined) delete process.env.BILLING_ENFORCE
    else process.env.BILLING_ENFORCE = prev
  })

  it("402s for an unentitled practice when BILLING_ENFORCE is on", async () => {
    process.env.BILLING_ENFORCE = "true"
    const service = makeService()
    const res = makeRes()

    await GET(makeReq(service), res)

    expect(res.statusCode).toBe(402)
    expect(res.body).toEqual({ error: "Subscription required." })
    expect(service.listCartBuildJobs).not.toHaveBeenCalled()
  })

  it("200s and lists jobs when the practice is entitled", async () => {
    process.env.BILLING_ENFORCE = "true"
    const service = makeService({ status: "active" })
    const res = makeRes()

    await GET(makeReq(service), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.jobs).toHaveLength(1)
    expect(service.listCartBuildJobs).toHaveBeenCalledWith(
      { practice_id: PRAC },
      expect.objectContaining({ take: 20 })
    )
  })

  it("proceeds with the flag off regardless of subscription", async () => {
    delete process.env.BILLING_ENFORCE
    const service = makeService()
    const res = makeRes()

    await GET(makeReq(service), res)

    expect(res.statusCode).toBe(200)
    expect(service.listCartBuildJobs).toHaveBeenCalled()
  })
})

describe("POST /medmkp/cart-builds — entitlement gate", () => {
  const prev = process.env.BILLING_ENFORCE
  afterEach(() => {
    if (prev === undefined) delete process.env.BILLING_ENFORCE
    else process.env.BILLING_ENFORCE = prev
  })

  const body = {
    supplier_id: "sup_1",
    lines: [{ name: "Gloves", qty: 2, productUrl: "https://supplier.test/gloves" }],
  }

  it("402s for an unentitled practice when BILLING_ENFORCE is on", async () => {
    process.env.BILLING_ENFORCE = "true"
    const service = makeService()
    const res = makeRes()

    await POST(makeReq(service, { body }), res)

    expect(res.statusCode).toBe(402)
    expect(res.body).toEqual({ error: "Subscription required." })
    expect(service.createCartBuildJobs).not.toHaveBeenCalled()
  })

  it("202s and enqueues a job when the practice is entitled", async () => {
    process.env.BILLING_ENFORCE = "true"
    const service = makeService({ status: "active" })
    const res = makeRes()

    await POST(makeReq(service, { body }), res)

    expect(res.statusCode).toBe(202)
    expect(res.body.job).toMatchObject({ id: "job_2", supplier_id: "sup_1" })
    expect(service.createCartBuildJobs).toHaveBeenCalledWith([
      expect.objectContaining({
        practice_id: PRAC,
        supplier_id: "sup_1",
        status: "queued",
      }),
    ])
  })

  it("proceeds with the flag off regardless of subscription", async () => {
    delete process.env.BILLING_ENFORCE
    const service = makeService()
    const res = makeRes()

    await POST(makeReq(service, { body }), res)

    expect(res.statusCode).toBe(202)
    expect(service.createCartBuildJobs).toHaveBeenCalled()
  })
})
