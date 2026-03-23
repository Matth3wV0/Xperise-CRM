import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { z } from "zod";
import { authenticate, authorize } from "../../common/auth-guard";
import {
  searchPeople,
  enrichPerson,
  type ApolloPersonResult,
} from "./apollo.service";

const searchSchema = z.object({
  personTitles: z.array(z.string()).optional(),
  organizationIndustries: z.array(z.string()).optional(),
  employeeRanges: z.array(z.string()).optional(),
  personLocations: z.array(z.string()).optional(),
  perPage: z.number().min(1).max(100).default(25),
  page: z.number().min(1).default(1),
});

const importSchema = z.object({
  people: z.array(
    z.object({
      apolloId: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      name: z.string(),
      title: z.string().optional(),
      email: z.string().nullable().optional(),
      emailStatus: z.string().nullable().optional(),
      linkedinUrl: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      orgName: z.string().optional(),
      orgIndustry: z.string().nullable().optional(),
      orgSize: z.number().nullable().optional(),
      orgCountry: z.string().nullable().optional(),
      orgWebsite: z.string().nullable().optional(),
    })
  ),
});

const INDUSTRY_MAP: Record<string, string> = {
  banking: "BANK",
  "financial services": "BANK",
  "consumer goods": "FMCG",
  fmcg: "FMCG",
  media: "MEDIA",
  "entertainment & media": "MEDIA",
  conglomerate: "CONGLOMERATE",
  technology: "TECH_DURABLE",
  "information technology": "TECH_DURABLE",
  "computer software": "TECH_DURABLE",
  pharmaceutical: "PHARMA_HEALTHCARE",
  health: "PHARMA_HEALTHCARE",
  healthcare: "PHARMA_HEALTHCARE",
  manufacturing: "MANUFACTURING",
};

const EMAIL_VERIFY_MAP: Record<string, string> = {
  verified: "VALID",
  valid: "VALID",
  invalid: "INVALID",
  unverifiable: "UNKNOWN",
  unknown: "UNKNOWN",
  accept_all: "ACCEPT_ALL",
  guessed: "UNKNOWN",
};

function mapIndustry(industry: string | null | undefined): string {
  if (!industry) return "OTHERS";
  const key = industry.toLowerCase();
  for (const [pattern, value] of Object.entries(INDUSTRY_MAP)) {
    if (key.includes(pattern)) return value;
  }
  return "OTHERS";
}

function mapEmailVerify(status: string | null | undefined): string {
  if (!status) return "UNKNOWN";
  return EMAIL_VERIFY_MAP[status.toLowerCase()] ?? "UNKNOWN";
}

function mapCompanySize(employees: number | null | undefined): string | null {
  if (!employees) return null;
  if (employees < 50) return "SME";
  if (employees < 200) return "MID_MARKET";
  if (employees < 1000) return "ENTERPRISE";
  return "LARGE_ENTERPRISE";
}

export async function apolloRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // ── POST /apollo/search ─────────────────────────────────────────────────────
  server.post(
    "/search",
    { preHandler: authorize("ADMIN", "MANAGER", "BD_STAFF") },
    async (request) => {
      const filters = searchSchema.parse(request.body);
      const result = await searchPeople(filters);
      return {
        people: result.people ?? [],
        pagination: result.pagination ?? {
          page: filters.page,
          per_page: filters.perPage,
          total_entries: 0,
          total_pages: 0,
        },
      };
    }
  );

  // ── POST /apollo/enrich/:contactId ──────────────────────────────────────────
  server.post<{ Params: { contactId: string } }>(
    "/enrich/:contactId",
    { preHandler: authorize("ADMIN", "MANAGER", "BD_STAFF") },
    async (request, reply) => {
      const contact = await prisma.contact.findUnique({
        where: { id: request.params.contactId },
        include: { company: { select: { name: true } } },
      });

      if (!contact) {
        return reply.status(404).send({ error: "Contact not found" });
      }

      // Cache hit — never enrich the same person twice (saves Apollo credits)
      if (contact.enrichmentData) {
        return {
          enriched: false,
          cached: true,
          fieldsUpdated: [],
          person: contact.enrichmentData,
        };
      }

      const nameParts = contact.fullName.split(" ");
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") ?? "";

      const result = await enrichPerson({
        firstName,
        lastName,
        organizationName: contact.company.name,
        email: contact.email ?? undefined,
        linkedinUrl: contact.linkedin ?? undefined,
      });

      if (!result.person) {
        return reply.status(404).send({ error: "No match found on Apollo.io" });
      }

      const person = result.person;

      // Update contact with enriched data + cache full Apollo response
      const updateData: Record<string, unknown> = {
        enrichmentData: person as any, // cache so we never call enrich again
      };
      if (person.email && !contact.email) updateData.email = person.email;
      if (person.linkedin_url && !contact.linkedin)
        updateData.linkedin = person.linkedin_url;
      if (person.title && !contact.position) updateData.position = person.title;
      if (person.email_status)
        updateData.emailVerify = mapEmailVerify(person.email_status);
      if (person.phone_numbers?.[0]?.raw_number && !contact.phone)
        updateData.phone = person.phone_numbers[0].raw_number;

      await prisma.contact.update({
        where: { id: contact.id },
        data: updateData as any,
      });

      const fieldsUpdated = Object.keys(updateData).filter(
        (k) => k !== "enrichmentData"
      );

      return {
        enriched: true,
        cached: false,
        fieldsUpdated,
        person,
      };
    }
  );

  // ── POST /apollo/import ─────────────────────────────────────────────────────
  server.post(
    "/import",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const { people } = importSchema.parse(request.body);

      const results = {
        companiesCreated: 0,
        contactsCreated: 0,
        contactsSkipped: 0,
        errors: [] as string[],
      };

      for (const person of people) {
        try {
          // Find or create company
          let company = person.orgName
            ? await prisma.company.findFirst({
                where: {
                  name: {
                    equals: person.orgName,
                    mode: "insensitive",
                  },
                },
              })
            : null;

          if (!company && person.orgName) {
            const sizeValue = mapCompanySize(person.orgSize);
            company = await prisma.company.create({
              data: {
                name: person.orgName,
                industry: mapIndustry(person.orgIndustry) as any,
                size: sizeValue as any,
                country: person.orgCountry ?? null,
                website: person.orgWebsite ?? null,
                employeeCount: person.orgSize
                  ? String(person.orgSize)
                  : null,
              },
            });
            results.companiesCreated++;
          }

          if (!company) {
            results.errors.push(
              `Skipped ${person.name}: no company information`
            );
            results.contactsSkipped++;
            continue;
          }

          // Check if contact already exists
          const orConditions = [];
          if (person.email) {
            orConditions.push({ email: person.email });
          }
          orConditions.push({
            fullName: { equals: person.name, mode: "insensitive" as const },
            companyId: company.id,
          });

          const existing = await prisma.contact.findFirst({
            where: { OR: orConditions },
          });

          if (existing) {
            results.contactsSkipped++;
            continue;
          }

          await prisma.contact.create({
            data: {
              fullName: person.name,
              position: person.title ?? null,
              email: person.email ?? null,
              linkedin: person.linkedinUrl ?? null,
              phone: person.phone ?? null,
              source: "APOLLO",
              emailVerify: mapEmailVerify(person.emailStatus) as any,
              companyId: company.id,
              assignedToId: request.user.id,
            },
          });
          results.contactsCreated++;
        } catch (err) {
          results.errors.push(
            `Failed to import ${person.name}: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }

      return results;
    }
  );
}
