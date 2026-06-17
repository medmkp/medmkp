import { redirect } from "next/navigation"
import { normalizeParam } from "../data"

// The product detail experience now lives inside the app shell at
// /app/product/[handle]. Preserve any existing /catalog/[handle] links by
// redirecting them to the new surface.
export default async function CatalogProductRedirect({ params }) {
  const resolvedParams = await params
  const handle = normalizeParam(resolvedParams.handle)
  redirect(`/app/product/${handle}`)
}
