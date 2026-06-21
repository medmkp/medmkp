import {
  extractPattersonProduct,
  isPattersonItemUrl,
  pattersonAdapter,
} from "../patterson"

// Faithful to real pattersondental.com /Supplies/ItemDetail markup: no JSON-LD,
// an HTML-entity-encoded item model (&quot;…&quot;) carrying the identity fields
// plus plain hidden inputs, and UnitPrice:null (price is login-gated). Field
// order and the redundant family/description shape mirror two live products.
const ITEM_HTML = `<!DOCTYPE html><html><head>
<title>Resin Handle Ultrasonic Scaler Inserts - Universal 10, 25 kHz, Orange</title>
</head><body>
<input id="ItemSkuDetail_ProductFamilyId" type="hidden" value="8876" />
<input id="ItemSkuDetail_PublicItemNumber" type="hidden" value="070107516" />
<script>
var model = {&quot;ItemDescription&quot;:&quot;Universal 10, 25 kHz, Orange&quot;,&quot;PublicItemNumber&quot;:&quot;070107516&quot;,&quot;UnitPrice&quot;:null,&quot;VendorCode&quot;:&quot;PREMIE&quot;,&quot;VendorName&quot;:&quot;Premier Dental Products&quot;,&quot;ManufacturerItemNumber&quot;:&quot;1006800&quot;,&quot;UnitOfMeasure&quot;:&quot;each&quot;,&quot;SeoFriendlyProductFamilyTitle&quot;:&quot;Resin-Handle-Ultrasonic-Scaler-Inserts&quot;,&quot;Attributes&quot;:[{&quot;Name&quot;:&quot;Manufacturer Name&quot;,&quot;Value&quot;:&quot;Premier Dental Products&quot;},{&quot;Name&quot;:&quot;Package Quantity&quot;,&quot;Value&quot;:&quot;1/Pkg&quot;}]};
</script>
</body></html>`

// A second product where the item description already restates the family — the
// name builder must not double it up.
const ITEM_HTML_REDUNDANT = `<!DOCTYPE html><html><head>
<input id="ItemSkuDetail_PublicItemNumber" type="hidden" value="050482067" />
<script>
var model = {&quot;ItemDescription&quot;:&quot;Door and Dam Gasket Kit M11 Sterilizer&quot;,&quot;PublicItemNumber&quot;:&quot;050482067&quot;,&quot;UnitPrice&quot;:null,&quot;VendorName&quot;:&quot;Midmark&quot;,&quot;ManufacturerItemNumber&quot;:&quot;002-10880-00&quot;,&quot;UnitOfMeasure&quot;:&quot;each&quot;,&quot;SeoFriendlyProductFamilyTitle&quot;:&quot;Door-and-Dam-Gasket-Kit&quot;};
</script>
</head></html>`

const URL = "https://www.pattersondental.com/Supplies/ItemDetail/070107516"

describe("patterson adapter", () => {
  it("extracts identity fields from the embedded item model", () => {
    const row = extractPattersonProduct(ITEM_HTML, URL)
    expect(row).not.toBeNull()
    expect(row!.sku).toBe("070107516")
    expect(row!.manufacturer_sku).toBe("1006800")
    expect(row!.brand).toBe("Premier Dental Products")
    expect(row!.name).toBe(
      "Resin Handle Ultrasonic Scaler Inserts - Universal 10, 25 kHz, Orange"
    )
    expect(row!.unit_of_measure).toBe("each")
    expect(row!.pack_size).toBe("1/Pkg")
    expect(row!.product_url).toBe(URL)
  })

  it("writes no price (Patterson gates pricing behind login)", () => {
    const row = extractPattersonProduct(ITEM_HTML, URL)
    expect(row!.price_cents).toBeUndefined()
    expect(row!.availability).toBe("unknown")
  })

  it("decodes the double-encoded model (JSON \\u escape + inner HTML entity)", () => {
    // "Brush & Paste" ships as `Brush &amp; Paste`: the & is an inner HTML
    // entity, JSON-escaped, inside the entity-encoded model.
    const html = `<input id="ItemSkuDetail_PublicItemNumber" type="hidden" value="070368886" />
<script>var model = {&quot;ItemDescription&quot;:&quot;Brush \\u0026amp; Paste&quot;,&quot;PublicItemNumber&quot;:&quot;070368886&quot;,&quot;VendorName&quot;:&quot;Patterson Office Supplies&quot;,&quot;SeoFriendlyProductFamilyTitle&quot;:&quot;Calendar-Card&quot;};</script>`
    const row = extractPattersonProduct(html, URL)
    expect(row!.name).toBe("Calendar Card - Brush & Paste")
    expect(row!.brand).toBe("Patterson Office Supplies")
  })

  it("does not double the family when the description restates it", () => {
    const row = extractPattersonProduct(ITEM_HTML_REDUNDANT, URL)
    expect(row!.name).toBe("Door and Dam Gasket Kit M11 Sterilizer")
    expect(row!.brand).toBe("Midmark")
    expect(row!.manufacturer_sku).toBe("002-10880-00")
  })

  it("falls back to the Patterson item number when no MPN is present", () => {
    const html = ITEM_HTML.replace(
      /&quot;ManufacturerItemNumber&quot;:&quot;1006800&quot;,/,
      ""
    )
    const row = extractPattersonProduct(html, URL)
    expect(row!.manufacturer_sku).toBe("070107516")
  })

  it("returns null when there is no item number", () => {
    expect(extractPattersonProduct("<html><body>nope</body></html>", URL)).toBeNull()
  })

  it("matches Patterson candidates by URL or distributor", () => {
    expect(
      pattersonAdapter.matches({ url: URL, distributor: "" } as never)
    ).toBe(true)
    expect(
      pattersonAdapter.matches({ url: "https://x.com", distributor: "Patterson Dental" } as never)
    ).toBe(true)
    expect(
      pattersonAdapter.matches({ url: "https://henryschein.com", distributor: "HS" } as never)
    ).toBe(false)
  })

  it("recognizes ItemDetail URLs", () => {
    expect(isPattersonItemUrl(URL)).toBe(true)
    expect(isPattersonItemUrl("https://www.pattersondental.com/Supplies/Deals")).toBe(false)
  })
})
