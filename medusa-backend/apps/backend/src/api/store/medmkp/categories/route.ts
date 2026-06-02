import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  medmkpCatalogItems,
  medmkpCategories,
  medmkpSuppliers,
} from "../../../../seed/medmkp-fixtures"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const categories = medmkpCategories.map((category) => {
    const bestValueItem = medmkpCatalogItems.find(
      (item) => item.id === category.best_value_item_id
    )
    const supplier = medmkpSuppliers.find(
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
