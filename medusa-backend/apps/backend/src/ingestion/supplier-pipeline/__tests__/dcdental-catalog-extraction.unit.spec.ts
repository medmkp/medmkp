import {
  assertDcDentalCatalogComplete,
  dcDentalItemToRow,
} from "../dcdental-catalog-extraction"

const origin = "https://www.dcdental.com"

describe("dcDentalItemToRow (flat catalog mapping)", () => {
  it("maps a catalog item to a row with a valid barcode and core fields", () => {
    const row = dcDentalItemToRow(
      {
        internalid: 303437,
        itemid: "199-FX175-M",
        upccode: "113577704810",
        manufacturer: "Garrison",
        storedisplayname2: "Composi-Tight 3D Fusion Full Curve Molar Matrices 50/Pk",
        storedetaileddescription: "<p>Sectional matrix bands.</p>",
        custitem_quik_view_subcat2: "Matrix Bands",
        onlinecustomerprice_detail: {
          onlinecustomerprice: 99.75,
          onlinecustomerprice_formatted: "$99.75",
        },
        isinstock: true,
        urlcomponent: "Composi-Tight-3D-Fusion-Full-Curve-Matrix-Bands-FX175-M",
        itemimages_detail: { urls: [{ url: "/img/fx175.jpg", altimagetext: "" }] },
      },
      origin
    )

    expect(row.barcode).toBe("113577704810")
    expect(row.sku).toBe("199-FX175-M")
    expect(row.manufacturer_sku).toBe("199-FX175-M")
    expect(row.brand).toBe("Garrison")
    expect(row.name).toBe("Composi-Tight 3D Fusion Full Curve Molar Matrices 50/Pk")
    expect(row.category).toBe("Matrix Bands")
    expect(row.price).toBe("$99.75")
    expect(row.availability).toBe("in_stock")
    expect(row.product_url).toBe(`${origin}/Composi-Tight-3D-Fusion-Full-Curve-Matrix-Bands-FX175-M`)
    expect(row.image_url).toBe(`${origin}/img/fx175.jpg`)
  })

  it("uses the description for the name when storedisplayname2 is just the SKU", () => {
    const row = dcDentalItemToRow(
      {
        itemid: "141-SCL515",
        upccode: "300034013602",
        storedisplayname2: "141-SCL515",
        storedescription: "<p>Duo-Check Sterilization Pouches</p>",
        custitem_quik_view_subcat2: "Duo-Check Pouches",
      },
      origin
    )

    expect(row.name).toBe("Duo-Check Sterilization Pouches")
    expect(row.barcode).toBe("300034013602")
    expect(row.category).toBe("Duo-Check Pouches")
  })

  it("leaves barcode empty for a non-GTIN upccode and no url when urlcomponent is missing", () => {
    const row = dcDentalItemToRow({ itemid: "X-1", upccode: "N/A" }, origin)
    expect(row.barcode).toBe("")
    expect(row.product_url).toBe("")
    expect(row.name).toBe("X-1")
  })
})

describe("assertDcDentalCatalogComplete (partial-replace guard)", () => {
  it("passes when the collected set covers the whole catalog", () => {
    expect(() => assertDcDentalCatalogComplete(39669, 39669, 3229)).not.toThrow()
    // 97% recall is acceptable (cross-listed items dedupe imperfectly).
    expect(() => assertDcDentalCatalogComplete(38600, 39669, 3229)).not.toThrow()
  })

  it("throws on an unknown catalog size (total<=0) instead of treating it as complete", () => {
    // The exact trigger of the data-loss incident: a 0/undefined total let an
    // empty walk count as 'complete' and feed a destructive replace.
    expect(() => assertDcDentalCatalogComplete(0, 0, 0)).toThrow(/size unknown/i)
    expect(() => assertDcDentalCatalogComplete(0, -1, 0)).toThrow(/size unknown/i)
  })

  it("throws when the collected set is well short of the catalog total", () => {
    expect(() => assertDcDentalCatalogComplete(1002, 39669, 3229)).toThrow(/incomplete/i)
  })
})
