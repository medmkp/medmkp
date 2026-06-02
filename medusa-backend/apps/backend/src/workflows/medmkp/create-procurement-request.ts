import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

type CreateProcurementRequestInput = {
  buyer_name: string
  buyer_email: string
  source_file_name: string
  notes?: string
}

const normalizeUploadedRequestStep = createStep(
  "normalize-uploaded-procurement-request",
  async (input: CreateProcurementRequestInput) => {
    return new StepResponse({
      buyer_name: input.buyer_name.trim(),
      buyer_email: input.buyer_email.trim().toLowerCase(),
      source_file_name: input.source_file_name.trim(),
      notes: input.notes?.trim() ?? "",
      status: "uploaded",
    })
  }
)

const createProcurementRequestWorkflow = createWorkflow(
  "create-procurement-request",
  (input: CreateProcurementRequestInput) => {
    const normalized = normalizeUploadedRequestStep(input)

    return new WorkflowResponse(normalized)
  }
)

export default createProcurementRequestWorkflow
