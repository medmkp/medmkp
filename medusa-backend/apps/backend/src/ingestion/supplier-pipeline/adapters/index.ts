import { dentalCityAdapter } from "./dentalcity"
import { dcDentalAdapter } from "./dcdental"
import { genericAdapter } from "./generic"
import { henryScheinAdapter } from "./henryschein"
import { pearsonAdapter } from "./pearson"
import { practiconAdapter } from "./practicon"
import { shastaAdapter } from "./shasta"
import { shopifyAdapter } from "./shopify"
import { skyDentalAdapter } from "./skydental"
import type {
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

const adapters: SupplierProductAdapter[] = [
  dcDentalAdapter,
  dentalCityAdapter,
  henryScheinAdapter,
  pearsonAdapter,
  practiconAdapter,
  shastaAdapter,
  shopifyAdapter,
  skyDentalAdapter,
  genericAdapter,
]

export function adapterForCandidate(candidate: ProductPageCandidate) {
  return adapters.find((adapter) => adapter.matches(candidate)) ?? genericAdapter
}
