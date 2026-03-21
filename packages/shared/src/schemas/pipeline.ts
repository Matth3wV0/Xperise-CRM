import { z } from "zod";

export const createPipelineSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  dealStage: z.enum(["NEW_CONVERTED", "MEETING", "PROPOSAL", "PILOT_POC", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"]).default("NEW_CONVERTED"),
  totalRevenue: z.number().int().min(0).default(0),
  probability: z.number().min(0).max(1).default(0),
  monthlyRevenue: z.record(z.string(), z.number()).optional(),
  picId: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

export const updatePipelineSchema = createPipelineSchema.partial();

export const movePipelineStageSchema = z.object({
  dealStage: z.enum(["NEW_CONVERTED", "MEETING", "PROPOSAL", "PILOT_POC", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"]),
});

export const pipelineFilterSchema = z.object({
  dealStage: z.string().optional(),
  companyId: z.string().optional(),
  picId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;
export type PipelineFilter = z.infer<typeof pipelineFilterSchema>;
