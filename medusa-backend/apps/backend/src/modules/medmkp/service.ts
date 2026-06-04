import { MedusaService } from "@medusajs/framework/utils"
import CatalogItem from "./models/catalog-item"
import CanonicalProductMatch from "./models/canonical-product-match"
import CanonicalProduct from "./models/canonical-product"
import ProcurementRequest from "./models/procurement-request"
import Quote from "./models/quote"
import Supplier from "./models/supplier"
import SupplierProduct from "./models/supplier-product"

class MedMKPModuleService extends MedusaService({
  Supplier,
  CanonicalProduct,
  SupplierProduct,
  CanonicalProductMatch,
  CatalogItem,
  ProcurementRequest,
  Quote,
}) {}

export default MedMKPModuleService
