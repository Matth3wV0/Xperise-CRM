import { z } from "zod";

export const createContactSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  position: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  linkedin: z.string().url("Invalid URL").optional().or(z.literal("")),
  source: z.enum(["CURRENT_XPERISE", "DESK_RESEARCH", "PERSONAL_REFERRAL", "APOLLO", "OTHER"]),
  priority: z.number().int().min(1).max(5).default(3),
  type: z.enum(["SNIPING", "HUNTING"]),
  contactStatus: z.enum(["NO_CONTACT", "CONTACT", "REACHED", "FOLLOW_UP", "MEETING_BOOKED", "CONVERTED"]).default("NO_CONTACT"),
  emailVerify: z.enum(["VALID", "INVALID", "UNKNOWN", "ACCEPT_ALL"]).default("UNKNOWN"),
  companyId: z.string().min(1, "Company is required"),
  assignedToId: z.string().optional(),
  notes: z.string().optional(),
});

export const updateContactSchema = createContactSchema.partial();

export const bulkStatusSchema = z.object({
  contactIds: z.array(z.string()).min(1),
  contactStatus: z.enum(["NO_CONTACT", "CONTACT", "REACHED", "FOLLOW_UP", "MEETING_BOOKED", "CONVERTED"]),
});

export const bulkAssignSchema = z.object({
  contactIds: z.array(z.string()).min(1),
  assignedToId: z.string(),
});

export const contactFilterSchema = z.object({
  search: z.string().optional(),
  industry: z.string().optional(),
  contactStatus: z.string().optional(),
  priority: z.coerce.number().optional(),
  type: z.string().optional(),
  source: z.string().optional(),
  assignedToId: z.string().optional(),
  companyId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ContactFilter = z.infer<typeof contactFilterSchema>;
