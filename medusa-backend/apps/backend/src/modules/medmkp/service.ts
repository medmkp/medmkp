import { MedusaService } from "@medusajs/framework/utils"
import CatalogItem from "./models/catalog-item"
import ProcurementRequest from "./models/procurement-request"
import Quote from "./models/quote"
import Supplier from "./models/supplier"

class MedMKPModuleService extends MedusaService({
  Supplier,
  CatalogItem,
  ProcurementRequest,
  Quote,
}) {}

export default MedMKPModuleService
