import type { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import {
  medmkpCatalogItems,
  medmkpCanonicalProducts,
  medmkpQuotes,
  medmkpRequests,
  medmkpSuppliers,
} from "../seed/medmkp-fixtures"

const starterProductHandles = ["t-shirt", "sweatshirt", "sweatpants", "shorts"]
const demoProductHandles = medmkpCanonicalProducts.map((product) => product.handle)
const demoProductCategories = medmkpCanonicalProducts.map(
  (product) => product.category
)

export default async function seedMedMKP({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  logger.info("Seeding MedMKP marketplace data...")

  const existingQuotes = await medmkp.listQuotes()
  const existingRequests = await medmkp.listProcurementRequests()
  const existingItems = await medmkp.listCatalogItems()
  const existingSuppliers = await medmkp.listSuppliers()

  if (existingQuotes.length) {
    await medmkp.deleteQuotes(existingQuotes.map((quote) => quote.id))
  }
  if (existingRequests.length) {
    await medmkp.deleteProcurementRequests(
      existingRequests.map((request) => request.id)
    )
  }
  if (existingItems.length) {
    await medmkp.deleteCatalogItems(existingItems.map((item) => item.id))
  }
  if (existingSuppliers.length) {
    await medmkp.deleteSuppliers(
      existingSuppliers.map((supplier) => supplier.id)
    )
  }

  await medmkp.createSuppliers(medmkpSuppliers as Parameters<typeof medmkp.createSuppliers>[0])
  await medmkp.createCatalogItems(
    medmkpCatalogItems as Parameters<typeof medmkp.createCatalogItems>[0]
  )
  await medmkp.createProcurementRequests(
    medmkpRequests as Parameters<typeof medmkp.createProcurementRequests>[0]
  )
  await medmkp.createQuotes(medmkpQuotes as Parameters<typeof medmkp.createQuotes>[0])

  logger.info("Resetting Medusa product catalog for MedMKP demo...")

  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  })
  const productsToDelete = existingProducts.filter((product) =>
    [...starterProductHandles, ...demoProductHandles].includes(product.handle)
  )

  if (productsToDelete.length) {
    await deleteProductsWorkflow(container).run({
      input: {
        ids: productsToDelete.map((product) => product.id),
      },
    })
  }

  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const missingCategoryNames = demoProductCategories.filter(
    (name) => !existingCategories.some((category) => category.name === name)
  )

  let createdCategories: { id: string; name: string }[] = []
  if (missingCategoryNames.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missingCategoryNames.map((name) => ({
          name,
          is_active: true,
        })),
      },
    })
    createdCategories = result
  }

  const categoriesByName = [...existingCategories, ...createdCategories].reduce(
    (acc, category) => {
      acc[category.name] = category.id
      return acc
    },
    {} as Record<string, string>
  )
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const { data: salesChannels } = await query.graph({
    entity: "sales_channels",
    fields: ["id"],
  })
  const shippingProfileId = shippingProfiles[0]?.id
  const salesChannelId = salesChannels[0]?.id

  if (!shippingProfileId || !salesChannelId) {
    throw new Error(
      "Cannot seed MedMKP demo products without a shipping profile and sales channel. Run npm run db:migrate first."
    )
  }

  await createProductsWorkflow(container).run({
    input: {
      products: medmkpCanonicalProducts.map((product) => {
        const bestOffer = medmkpCatalogItems
          .filter((item) => item.medusa_product_handle === product.handle)
          .sort((a, b) => b.comparable_score - a.comparable_score)[0]

        return {
          title: product.title,
          subtitle: product.subtitle,
          description: product.description,
          handle: product.handle,
          category_ids: [categoriesByName[product.category]],
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfileId,
          options: [
            {
              title: "Unit",
              values: [product.unit],
            },
          ],
          variants: [
            {
              title: product.unit,
              sku: bestOffer?.sku ?? product.handle.toUpperCase(),
              options: {
                Unit: product.unit,
              },
              prices: [
                {
                  amount: (bestOffer?.unit_price_cents ?? 0) / 100,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [{ id: salesChannelId }],
        }
      }),
    },
  })

  logger.info("Finished seeding MedMKP marketplace data.")
}
