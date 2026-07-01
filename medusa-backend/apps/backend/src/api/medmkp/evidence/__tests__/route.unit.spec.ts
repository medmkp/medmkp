import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { GET as LIST, POST as CREATE } from "../route"
import { GET as DETAIL, PATCH as UPDATE } from "../[id]/route"

// Exercises the practice-scoped evidence metadata routes against a stubbed module
// service + a stubbed practice-link knex query. Covers practice scoping,
// enum/shape validation, create/list/detail/update, and not-found/cross-practice.

const PRAC = "prac_1"

function makeService(seed: any[] = [], subs: any[] = []) {
  const docs = [...seed]
  return {
    docs,
    // Read by entitlement() via assertEntitled — active sub ⇒ entitled.
    listPracticeSubscriptions: jest.fn(async () => subs),
    listEvidenceDocuments: jest.fn(async (filter: Record<string, any>) =>
      docs.filter((d) => Object.entries(filter).every(([k, v]) => d[k] === v))
    ),
    retrieveEvidenceDocument: jest.fn(async (id: string) => {
      const d = docs.find((x) => x.id === id)
      if (!d) throw new Error("not found")
      return d
    }),
    createEvidenceDocuments: jest.fn(async (data: Record<string, any>) => {
      const row = { id: "evdoc_new", status: "captured", ...data }
      docs.push(row)
      return row
    }),
    updateEvidenceDocuments: jest.fn(async (data: Record<string, any>) => {
      const d = docs.find((x) => x.id === data.id)
      Object.assign(d, data)
      return d
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
  {
    actorId = "cus_1",
    practiceId = PRAC as string | null,
    body,
    query = {},
    params = {},
  }: { actorId?: string | null; practiceId?: string | null; body?: any; query?: any; params?: any } = {}
) {
  const knex = makeKnex(practiceId)
  const resolve = (token: string) =>
    token === ContainerRegistrationKeys.PG_CONNECTION ? knex : service
  return {
    auth_context: actorId ? { actor_id: actorId } : undefined,
    scope: { resolve },
    body,
    query,
    params,
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

const SDS = {
  id: "evdoc_sds",
  practice_id: PRAC,
  document_type: "sds",
  status: "captured",
  inventory_item_id: "inv_1",
}
const IFU = {
  id: "evdoc_ifu",
  practice_id: PRAC,
  document_type: "ifu",
  status: "verified",
  inventory_item_id: "inv_2",
}
const OTHER_PRACTICE = { id: "evdoc_x", practice_id: "prac_other", document_type: "sds", status: "captured" }

describe("GET /medmkp/evidence — list", () => {
  it("returns only the caller's practice documents, newest first", async () => {
    const service = makeService([SDS, IFU, OTHER_PRACTICE])
    const res = makeRes()
    await LIST(makeReq(service), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.evidence.map((d: any) => d.id).sort()).toEqual(["evdoc_ifu", "evdoc_sds"])
    expect(service.listEvidenceDocuments).toHaveBeenCalledWith(
      { practice_id: PRAC },
      expect.objectContaining({ order: { created_at: "DESC" } })
    )
  })

  it("applies document_type / status / linkage filters", async () => {
    const service = makeService([SDS, IFU, OTHER_PRACTICE])
    const res = makeRes()
    await LIST(makeReq(service, { query: { document_type: "ifu" } }), res)
    expect(res.body.evidence.map((d: any) => d.id)).toEqual(["evdoc_ifu"])

    const res2 = makeRes()
    await LIST(makeReq(service, { query: { inventory_item_id: "inv_1" } }), res2)
    expect(res2.body.evidence.map((d: any) => d.id)).toEqual(["evdoc_sds"])
  })

  it("rejects an invalid status filter with 422", async () => {
    const service = makeService([SDS])
    const res = makeRes()
    await LIST(makeReq(service, { query: { status: "bogus" } }), res)
    expect(res.statusCode).toBe(422)
    expect(service.listEvidenceDocuments).not.toHaveBeenCalled()
  })

  it("401s when unauthenticated", async () => {
    const service = makeService([SDS])
    const res = makeRes()
    await LIST(makeReq(service, { actorId: null }), res)
    expect(res.statusCode).toBe(401)
  })

  it("404s when the account has no linked practice", async () => {
    const service = makeService([SDS])
    const res = makeRes()
    await LIST(makeReq(service, { practiceId: null }), res)
    expect(res.statusCode).toBe(404)
  })
})

describe("GET /medmkp/evidence — entitlement gate (Unlock Practice paywall)", () => {
  const prev = process.env.BILLING_ENFORCE
  afterEach(() => {
    if (prev === undefined) delete process.env.BILLING_ENFORCE
    else process.env.BILLING_ENFORCE = prev
  })

  it("402s for an unentitled practice when BILLING_ENFORCE is on", async () => {
    process.env.BILLING_ENFORCE = "true"
    const service = makeService([SDS, IFU]) // no active subscription
    const res = makeRes()
    await LIST(makeReq(service), res)
    expect(res.statusCode).toBe(402)
    expect(service.listEvidenceDocuments).not.toHaveBeenCalled()
  })

  it("200s with the evidence list when the practice is entitled", async () => {
    process.env.BILLING_ENFORCE = "true"
    const service = makeService([SDS, IFU], [{ status: "active" }])
    const res = makeRes()
    await LIST(makeReq(service), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.evidence.map((d: any) => d.id).sort()).toEqual(["evdoc_ifu", "evdoc_sds"])
  })

  it("200s with the flag off regardless of subscription (prod default)", async () => {
    delete process.env.BILLING_ENFORCE
    const service = makeService([SDS]) // no active subscription
    const res = makeRes()
    await LIST(makeReq(service), res)
    expect(res.statusCode).toBe(200)
    expect(service.listEvidenceDocuments).toHaveBeenCalled()
  })
})

describe("POST /medmkp/evidence — create", () => {
  it("creates a metadata-only record scoped to the practice", async () => {
    const service = makeService()
    const res = makeRes()
    await CREATE(
      makeReq(service, {
        body: { document_type: "lot", lot_number: "  L42 ", inventory_item_id: "inv_9" },
      }),
      res
    )

    expect(res.statusCode).toBe(201)
    expect(res.body.evidence).toMatchObject({
      practice_id: PRAC,
      document_type: "lot",
      status: "captured",
      lot_number: "L42",
      inventory_item_id: "inv_9",
      created_by: "cus_1",
      updated_by: "cus_1",
    })
  })

  it("never mass-assigns practice_id from the body", async () => {
    const service = makeService()
    const res = makeRes()
    await CREATE(
      makeReq(service, { body: { document_type: "sds", practice_id: "prac_evil", id: "evil" } }),
      res
    )
    expect(res.body.evidence.practice_id).toBe(PRAC)
    expect(res.body.evidence.id).toBe("evdoc_new")
  })

  it("rejects an invalid document_type with 422", async () => {
    const service = makeService()
    const res = makeRes()
    await CREATE(makeReq(service, { body: { document_type: "nope" } }), res)
    expect(res.statusCode).toBe(422)
    expect(service.createEvidenceDocuments).not.toHaveBeenCalled()
  })

  it("rejects a missing document_type with 422", async () => {
    const service = makeService()
    const res = makeRes()
    await CREATE(makeReq(service, { body: { status: "captured" } }), res)
    expect(res.statusCode).toBe(422)
  })

  it("rejects an invalid status with 422", async () => {
    const service = makeService()
    const res = makeRes()
    await CREATE(makeReq(service, { body: { document_type: "sds", status: "weird" } }), res)
    expect(res.statusCode).toBe(422)
  })

  it("rejects a negative file_size_bytes and a bad date with 422", async () => {
    const service = makeService()
    const res = makeRes()
    await CREATE(makeReq(service, { body: { document_type: "sds", file_size_bytes: -1 } }), res)
    expect(res.statusCode).toBe(422)

    const res2 = makeRes()
    await CREATE(
      makeReq(service, { body: { document_type: "sds", expiration_date: "not-a-date" } }),
      res2
    )
    expect(res2.statusCode).toBe(422)
  })
})

describe("GET /medmkp/evidence/:id — detail", () => {
  it("returns a practice-owned document", async () => {
    const service = makeService([SDS])
    const res = makeRes()
    await DETAIL(makeReq(service, { params: { id: "evdoc_sds" } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.evidence.id).toBe("evdoc_sds")
  })

  it("404s on a cross-practice document", async () => {
    const service = makeService([OTHER_PRACTICE])
    const res = makeRes()
    await DETAIL(makeReq(service, { params: { id: "evdoc_x" } }), res)
    expect(res.statusCode).toBe(404)
  })

  it("404s when the document does not exist", async () => {
    const service = makeService([])
    const res = makeRes()
    await DETAIL(makeReq(service, { params: { id: "missing" } }), res)
    expect(res.statusCode).toBe(404)
  })
})

describe("PATCH /medmkp/evidence/:id — update", () => {
  it("updates editable metadata and stamps updated_by", async () => {
    const service = makeService([{ ...SDS }])
    const res = makeRes()
    await UPDATE(
      makeReq(service, { params: { id: "evdoc_sds" }, body: { notes: "checked", status: "partial" } }),
      res
    )
    expect(res.statusCode).toBe(200)
    expect(res.body.evidence).toMatchObject({ notes: "checked", status: "partial", updated_by: "cus_1" })
  })

  it("stamps reviewed_at/reviewed_by when moving to a reviewed status", async () => {
    const service = makeService([{ ...SDS }])
    const res = makeRes()
    await UPDATE(makeReq(service, { params: { id: "evdoc_sds" }, body: { status: "verified" } }), res)
    expect(res.body.evidence.status).toBe("verified")
    expect(res.body.evidence.reviewed_by).toBe("cus_1")
    expect(res.body.evidence.reviewed_at).toBeInstanceOf(Date)
  })

  it("does not overwrite an explicitly supplied reviewed_by", async () => {
    const service = makeService([{ ...SDS }])
    const res = makeRes()
    await UPDATE(
      makeReq(service, {
        params: { id: "evdoc_sds" },
        body: { status: "rejected", reviewed_by: "cus_reviewer" },
      }),
      res
    )
    expect(res.body.evidence.reviewed_by).toBe("cus_reviewer")
  })

  it("rejects an invalid status with 422", async () => {
    const service = makeService([{ ...SDS }])
    const res = makeRes()
    await UPDATE(makeReq(service, { params: { id: "evdoc_sds" }, body: { status: "nope" } }), res)
    expect(res.statusCode).toBe(422)
    expect(service.updateEvidenceDocuments).not.toHaveBeenCalled()
  })

  it("404s on a cross-practice document", async () => {
    const service = makeService([OTHER_PRACTICE])
    const res = makeRes()
    await UPDATE(makeReq(service, { params: { id: "evdoc_x" }, body: { notes: "x" } }), res)
    expect(res.statusCode).toBe(404)
    expect(service.updateEvidenceDocuments).not.toHaveBeenCalled()
  })
})
