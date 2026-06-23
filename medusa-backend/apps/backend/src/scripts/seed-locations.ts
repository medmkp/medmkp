import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import { LOCATION_TYPES, mintQrCode } from "../utils/inventory"

// Seeds a practice's Location Board with the standard set of rooms (the layout
// from the Locations design board). Idempotent: skips a room when the practice
// already has a location with that name. Scoped to a single practice, resolved
// from a customer email (--email=…) or an explicit --practice=… id.
//
//   npx medusa exec ./src/scripts/seed-locations.ts -- --email=you@example.com
//   npx medusa exec ./src/scripts/seed-locations.ts -- --practice=dp_123 --dry-run

const PRACTICE_LINK_TABLE = "customer_customer_medmkp_medmkp_dental_practice"

type Room = { name: string; type: (typeof LOCATION_TYPES)[number]; notes: string }

const ROOMS: Room[] = [
  { name: "Hygiene Cabinet", type: "cabinet", notes: "Hygiene Room" },
  { name: "Operatory 1", type: "operatory", notes: "Operatory · Treatment Room" },
  { name: "Sterilization", type: "sterilization", notes: "Sterilization Room · Equipment" },
  { name: "Emergency Kit", type: "emergency_kit", notes: "Hallway · Emergency Supplies" },
  { name: "Lab", type: "lab", notes: "Lab Room · Work Area" },
  { name: "Storage", type: "storage", notes: "Storage Room · Supplies" },
]

// medusa exec forwards CLI flags via process.argv (the injected `args` param is
// empty), so read them there — matching the other scripts in this directory.
function argValue(key: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${key}=`))
  return hit ? hit.split("=").slice(1).join("=").trim() : undefined
}

export default async function seedLocations({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  const dryRun = process.argv.includes("--dry-run")
  let practiceId = argValue("practice")
  const email = argValue("email")

  // Resolve the practice from a customer email when no explicit id is given.
  if (!practiceId && email) {
    const [customer] = await knex.select("id").from("customer").where({ email }).limit(1)
    if (!customer) throw new Error(`No customer found for email "${email}".`)
    const [link] = await knex
      .select("medmkp_dental_practice_id")
      .from(PRACTICE_LINK_TABLE)
      .where({ customer_id: customer.id })
      .whereNull("deleted_at")
      .limit(1)
    if (!link) throw new Error(`Customer "${email}" is not linked to any practice.`)
    practiceId = link.medmkp_dental_practice_id
  }

  if (!practiceId) {
    // No target given — list practices so the operator can pick one.
    const practices = await knex.select("id", "name").from("medmkp_dental_practice").whereNull("deleted_at").limit(25)
    logger.info(`No --practice or --email given. Available practices:`)
    for (const p of practices) logger.info(`  ${p.id}  ${p.name}`)
    throw new Error("Pass --practice=<id> or --email=<customer email> to choose the target practice.")
  }

  const existing = await medmkp.listLocations({ practice_id: practiceId })
  const existingNames = new Set((existing as any[]).map((l) => l.name))
  logger.info(`Seeding locations for practice ${practiceId} (${existing.length} already present)${dryRun ? " [dry-run]" : ""}`)

  let created = 0
  for (const room of ROOMS) {
    if (existingNames.has(room.name)) {
      logger.info(`  skip "${room.name}" (already exists)`)
      continue
    }
    if (dryRun) {
      logger.info(`  would create "${room.name}" (${room.type})`)
      continue
    }
    await medmkp.createLocations({
      practice_id: practiceId,
      name: room.name,
      type: room.type,
      qr_code: mintQrCode(),
      notes: room.notes,
    })
    logger.info(`  created "${room.name}" (${room.type})`)
    created += 1
  }

  logger.info(dryRun ? "Dry-run complete." : `Done. Created ${created} location(s).`)
}
