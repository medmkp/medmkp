// Admin support tool: force a live Stripe re-read of one practice's subscription.
// Reconcile is mocked here (its own behavior is covered in utils/billing spec);
// this asserts the route's validation + wiring.
const mockReconcile = jest.fn()
jest.mock("../../../../../../utils/billing", () => ({
  stripeConfigured: jest.fn(() => true),
  getStripe: jest.fn(() => ({})),
  reconcilePracticeFromStripe: (...args: any[]) => mockReconcile(...args),
}))

import { POST } from "../route"
import { stripeConfigured } from "../../../../../../utils/billing"

const reconcile = mockReconcile
const mockConfigured = stripeConfigured as jest.Mock

function makeReq(body: any) {
  return { scope: { resolve: () => ({}) }, body } as any
}
function makeRes() {
  const res: any = { statusCode: 200 }
  res.status = (c: number) => ((res.statusCode = c), res)
  res.json = (p: any) => ((res.body = p), res)
  return res
}

describe("POST /admin/medmkp/billing/resync", () => {
  beforeEach(() => {
    reconcile.mockReset()
    mockConfigured.mockReset().mockReturnValue(true)
  })

  it("force re-syncs a practice and returns the fresh subscription", async () => {
    reconcile.mockResolvedValue({
      sub: { id: "mps_1", status: "active" },
      entitled: true,
      reconciled: true,
    })
    const res = makeRes()
    await POST(makeReq({ practice_id: "prac_1" }), res)
    expect(reconcile).toHaveBeenCalledWith(expect.anything(), "prac_1", expect.anything())
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ practice_id: "prac_1", entitled: true })
    expect(res.body.subscription.status).toBe("active")
  })

  it("422s when practice_id is missing", async () => {
    const res = makeRes()
    await POST(makeReq({}), res)
    expect(res.statusCode).toBe(422)
    expect(reconcile).not.toHaveBeenCalled()
  })

  it("503s when Stripe is not configured", async () => {
    mockConfigured.mockReturnValue(false)
    const res = makeRes()
    await POST(makeReq({ practice_id: "prac_1" }), res)
    expect(res.statusCode).toBe(503)
    expect(reconcile).not.toHaveBeenCalled()
  })
})
