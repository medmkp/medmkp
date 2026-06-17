import { dcDentalAdapter } from "../dcdental"
import type { ProductPageCandidate } from "../../types"

function candidate(partial: Partial<ProductPageCandidate> = {}): ProductPageCandidate {
  return {
    distributor: "DC Dental",
    website_url: "https://www.dcdental.com",
    origin: "https://www.dcdental.com",
    prices: "Y",
    sitemap_url: "https://www.dcdental.com/api/items?fieldset=search",
    url: "https://www.dcdental.com/Composi-Tight-3D-Fusion-Full-Curve-Matrix-Bands-FX175-M",
    url_type: "product",
    confidence_score: 95,
    reasons: ["test"],
    category: "Dental supplies",
    subcategory: "",
    ...partial,
  }
}

function htmlWithApiItem(item: Record<string, unknown>) {
  return `<html><body>
    <script type="application/json" id="medmkp-dcdental-api">
      ${JSON.stringify({ items: [item] })}
    </script>
  </body></html>`
}

describe("DC Dental adapter barcode extraction", () => {
  it("captures a valid upccode as the row barcode (without disturbing other fields)", () => {
    const row = dcDentalAdapter.extractProduct(
      candidate(),
      htmlWithApiItem({
        internalid: 303437,
        itemid: "199-FX175-M",
        upccode: "113577704810",
        manufacturer: "Garrison",
        storedisplayname2: "Composi-Tight 3D Fusion Full Curve Molar Matrices 50/Pk",
        onlinecustomerprice_detail: { onlinecustomerprice: 99.75, onlinecustomerprice_formatted: "$99.75" },
        isinstock: true,
        urlcomponent: "Composi-Tight-3D-Fusion-Full-Curve-Matrix-Bands-FX175-M",
        quantityavailable: 9,
      })
    )

    expect(row.barcode).toBe("113577704810")
    expect(row.sku).toBe("199-FX175-M")
    expect(row.manufacturer_sku).toBe("199-FX175-M")
    expect(row.brand).toBe("Garrison")
  })

  it("leaves barcode empty when upccode is missing or not a GTIN-shaped value", () => {
    const missing = dcDentalAdapter.extractProduct(
      candidate(),
      htmlWithApiItem({ itemid: "199-NOUPC", manufacturer: "Acme" })
    )
    expect(missing.barcode).toBe("")

    const garbage = dcDentalAdapter.extractProduct(
      candidate(),
      htmlWithApiItem({ itemid: "199-BAD", upccode: "N/A", manufacturer: "Acme" })
    )
    expect(garbage.barcode).toBe("")
  })
})
