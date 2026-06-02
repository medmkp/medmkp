import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import {
  medmkpCatalogItems,
  medmkpCategories,
  medmkpSuppliers,
} from "../../../../seed/medmkp-fixtures"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [dbItems, dbSuppliers] = await Promise.all([
    medmkp.listCatalogItems(),
    medmkp.listSuppliers(),
  ])
  const catalogItems = dbItems.length ? dbItems : medmkpCatalogItems
  const suppliers = dbSuppliers.length ? dbSuppliers : medmkpSuppliers

  const categories = medmkpCategories.map((category) => {
    const categoryItems = catalogItems.filter(
      (item) => item.category === category.name
    )
    const bestValueItem =
      categoryItems.sort((a, b) => b.comparable_score - a.comparable_score)[0] ??
      catalogItems.find((item) => item.id === category.best_value_item_id)
    const supplier = suppliers.find(
      (entry) => entry.id === bestValueItem?.supplier_id
    )

    return {
      ...category,
      best_value_item: bestValueItem
        ? {
            ...bestValueItem,
            supplier_name: supplier?.name ?? "Unknown supplier",
          }
        : null,
    }
  })

  res.json({ categories })
}
