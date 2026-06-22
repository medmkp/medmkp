import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("./catalog.jsx", import.meta.url), "utf8");

test("product detail quantity defaults to one", () => {
  const productDetail = pageSource.match(
    /function ProductDetail\([\s\S]*?(?=\nfunction [A-Z]|\nexport default|$)/
  )?.[0];

  assert.ok(productDetail, "ProductDetail source should be present");
  assert.match(productDetail, /const \[qty, setQty\] = useState\(1\);/);
});
