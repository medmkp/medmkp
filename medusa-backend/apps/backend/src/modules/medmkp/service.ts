import { MedusaService } from "@medusajs/framework/utils"
import CatalogItem from "./models/catalog-item"
import CanonicalProductMatch from "./models/canonical-product-match"
import CanonicalProduct from "./models/canonical-product"
import DentalPractice from "./models/dental-practice"
import InvoiceLineItem from "./models/invoice-line-item"
import Invoice from "./models/invoice"
import PracticeSubscription from "./models/practice-subscription"
import ProcurementRequest from "./models/procurement-request"
import Quote from "./models/quote"
import ReorderList from "./models/reorder-list"
import SavingsOpportunity from "./models/savings-opportunity"
import SavingsReport from "./models/savings-report"
import SupplierCatalogSource from "./models/supplier-catalog-source"
import SupplierCredential from "./models/supplier-credential"
import SupplierPriceSnapshot from "./models/supplier-price-snapshot"
import Supplier from "./models/supplier"
import SupplierProduct from "./models/supplier-product"
import CartBuildJob from "./models/cart-build-job"

class MedMKPModuleService extends MedusaService({
  DentalPractice,
  PracticeSubscription,
  Invoice,
  InvoiceLineItem,
  Supplier,
  CanonicalProduct,
  SupplierProduct,
  CanonicalProductMatch,
  SupplierCatalogSource,
  SupplierCredential,
  CartBuildJob,
  SupplierPriceSnapshot,
  SavingsOpportunity,
  SavingsReport,
  CatalogItem,
  ProcurementRequest,
  Quote,
  ReorderList,
}) {}

export default MedMKPModuleService
