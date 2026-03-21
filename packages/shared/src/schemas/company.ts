import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  industry: z.enum(["BANK", "FMCG", "MEDIA", "CONGLOMERATE", "TECH_DURABLE", "PHARMA_HEALTHCARE", "MANUFACTURING", "OTHERS"]).default("OTHERS"),
  phone: z.string().optional(),
  country: z.string().optional(),
  size: z.enum(["SME", "MID_MARKET", "ENTERPRISE", "LARGE_ENTERPRISE"]).optional(),
  employeeCount: z.string().optional(),
  annualSpend: z.string().optional(),
  fitScore: z.number().int().min(1).max(5).optional(),
  primaryUseCase: z.string().optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  notes: z.string().optional(),
});

export const updateCompanySchema = createCompanySchema.partial();

export const companyFilterSchema = z.object({
  search: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CompanyFilter = z.infer<typeof companyFilterSchema>;
