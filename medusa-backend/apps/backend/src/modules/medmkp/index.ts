import { Module } from "@medusajs/framework/utils"
import MedMKPModuleService from "./service"

export const MEDMKP_MODULE = "medmkp"

export default Module(MEDMKP_MODULE, {
  service: MedMKPModuleService,
})
