import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { z } from "zod";
import { authenticate, authorize } from "../../common/auth-guard";
import {
  searchPeople,
  enrichPerson,
  bulkEnrichPeople,
  type ApolloPersonResult,
} from "./apollo.service";

const checkExistingSchema = z.object({
  people: z.array(
    z.object({
      id: z.string(),
      email: z.string().nullable().optional(),
      name: z.string(),
      orgName: z.string().optional(),
    })
  ),
});

const searchSchema = z.object({
  personTitles: z.array(z.string()).optional(),
  organizationIndustries: z.array(z.string()).optional(),
  employeeRanges: z.array(z.string()).optional(),
  personLocations: z.array(z.string()).optional(),
  personSeniorities: z.array(z.string()).optional(),
  qKeywords: z.string().optional(),
  qOrganizationName: z.string().optional(),
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
  enrich: z.boolean().default(true), // Auto-enrich via bulk_match after import
});

const bulkEnrichSchema = z.object({
  contactIds: z.array(z.string()).min(1).max(100),
  force: z.boolean().default(false), // Skip enrichmentData cache check
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/** Build Prisma update data from Apollo enrichment person response */
function buildEnrichmentUpdate(
  person: ApolloPersonResult,
  existing: { email: string | null; linkedin: string | null; position: string | null; phone: string | null; fullName: string }
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    enrichmentData: person as any,
  };

  // Update fullName if enrichment provides a real full name (not obfuscated)
  if (person.first_name && person.last_name) {
    const enrichedName = `${person.first_name} ${person.last_name}`;
    if (enrichedName !== existing.fullName) {
      update.fullName = enrichedName;
    }
  }

  if (person.email && !existing.email) update.email = person.email;
  if (person.linkedin_url && !existing.linkedin) update.linkedin = person.linkedin_url;
  if (person.title && !existing.position) update.position = person.title;
  if (person.email_status) update.emailVerify = mapEmailVerify(person.email_status);
  if (person.phone_numbers?.[0]?.raw_number && !existing.phone)
    update.phone = person.phone_numbers[0].raw_number;

  return update;
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
      const people = result.people ?? [];

      // Apollo may return pagination nested OR as top-level fields — normalize both
      const page = result.pagination?.page ?? result.page ?? filters.page;
      const per_page = result.pagination?.per_page ?? result.per_page ?? filters.perPage;
      const total_entries = result.pagination?.total_entries ?? result.total_entries ?? 0;

      // Calculate total_pages from total_entries when available.
      // Fallback: if total_entries is missing but we got a full page, there may be more.
      let total_pages: number;
      if (total_entries > 0) {
        total_pages = Math.ceil(total_entries / per_page);
      } else if (people.length > 0 && people.length >= per_page) {
        // Full page returned — assume at least one more page exists
        total_pages = filters.page + 1;
      } else {
        // Partial or empty page — this is the last page
        total_pages = filters.page;
      }

      return {
        people,
        pagination: { page, per_page, total_entries, total_pages },
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
      const { people, enrich } = importSchema.parse(request.body);

      const results = {
        companiesCreated: 0,
        contactsCreated: 0,
        contactsSkipped: 0,
        errors: [] as string[],
        enrichment: {
          requested: 0,
          enriched: 0,
          missing: 0,
          creditsConsumed: 0,
          fieldsUpdated: 0,
        },
      };

      // Track created contacts for post-import enrichment
      const createdContacts: Array<{
        crmId: string;
        apolloId: string;
        email: string | null;
        linkedin: string | null;
        position: string | null;
        phone: string | null;
        fullName: string;
      }> = [];

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

          const newContact = await prisma.contact.create({
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
              apolloContactId: person.apolloId,
            },
          });
          results.contactsCreated++;

          createdContacts.push({
            crmId: newContact.id,
            apolloId: person.apolloId,
            email: person.email ?? null,
            linkedin: person.linkedinUrl ?? null,
            position: person.title ?? null,
            phone: person.phone ?? null,
            fullName: person.name,
          });
        } catch (err) {
          results.errors.push(
            `Failed to import ${person.name}: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }

      // ── Auto-enrich after import ────────────────────────────────────────────
      if (enrich && createdContacts.length > 0) {
        const batches = chunk(createdContacts, 10);
        results.enrichment.requested = createdContacts.length;

        for (const batch of batches) {
          try {
            const details = batch.map((c) => ({ id: c.apolloId }));
            const enrichResult = await bulkEnrichPeople(details);

            results.enrichment.creditsConsumed += enrichResult.credits_consumed ?? 0;
            results.enrichment.missing += enrichResult.missing_records ?? 0;

            // Map enriched results by Apollo person ID
            const matchMap = new Map(
              (enrichResult.matches ?? []).map((m) => [m.id, m])
            );

            for (const contact of batch) {
              const person = matchMap.get(contact.apolloId);
              if (!person) continue;

              results.enrichment.enriched++;

              const updateData = buildEnrichmentUpdate(person, contact);
              const fieldsUpdated = Object.keys(updateData).filter(
                (k) => k !== "enrichmentData"
              );
              results.enrichment.fieldsUpdated += fieldsUpdated.length;

              await prisma.contact.update({
                where: { id: contact.crmId },
                data: updateData as any,
              });
            }
          } catch (err) {
            results.errors.push(
              `Enrichment batch failed: ${err instanceof Error ? err.message : "Unknown error"}`
            );
          }
        }
      }

      return results;
    }
  );

  // ── POST /apollo/check-existing ─────────────────────────────────────────────
  // Batch dedup check: given Apollo search results, returns which people already
  // exist in the CRM (by email OR by name+company). 3 DB queries regardless of size.
  server.post(
    "/check-existing",
    { preHandler: authorize("ADMIN", "MANAGER", "BD_STAFF") },
    async (request) => {
      const { people } = checkExistingSchema.parse(request.body);

      if (people.length === 0) return { existingIds: [] };

      // 1. Email batch check
      const emails = people
        .map((p) => p.email)
        .filter((e): e is string => !!e);

      const emailContacts = emails.length > 0
        ? await prisma.contact.findMany({
            where: { email: { in: emails, mode: "insensitive" } },
            select: { email: true },
          })
        : [];
      const matchedEmails = new Set(
        emailContacts.map((c) => c.email?.toLowerCase()).filter(Boolean)
      );

      // 2. Company name → ID batch lookup
      const orgNames = [
        ...new Set(
          people.map((p) => p.orgName).filter((n): n is string => !!n)
        ),
      ];
      const companies = orgNames.length > 0
        ? await prisma.company.findMany({
            where: { name: { in: orgNames, mode: "insensitive" } },
            select: { id: true, name: true },
          })
        : [];
      const companyMap = new Map(
        companies.map((c) => [c.name.toLowerCase(), c.id])
      );

      // 3. Name + companyId batch check
      const nameCompanyPairs = people
        .filter((p) => p.orgName && companyMap.has(p.orgName.toLowerCase()))
        .map((p) => ({
          fullName: { equals: p.name, mode: "insensitive" as const },
          companyId: companyMap.get(p.orgName!.toLowerCase())!,
        }));

      const nameContacts = nameCompanyPairs.length > 0
        ? await prisma.contact.findMany({
            where: { OR: nameCompanyPairs },
            select: { fullName: true, companyId: true },
          })
        : [];

      const nameCompanySet = new Set(
        nameContacts.map((c) => `${c.fullName.toLowerCase()}|${c.companyId}`)
      );

      // 4. Determine which Apollo IDs already exist in CRM
      const existingIds = people
        .filter((p) => {
          if (p.email && matchedEmails.has(p.email.toLowerCase())) return true;
          if (p.orgName) {
            const companyId = companyMap.get(p.orgName.toLowerCase());
            if (
              companyId &&
              nameCompanySet.has(`${p.name.toLowerCase()}|${companyId}`)
            ) {
              return true;
            }
          }
          return false;
        })
        .map((p) => p.id);

      return { existingIds };
    }
  );

  // ── POST /apollo/enrich-bulk ────────────────────────────────────────────────
  // Enrich existing CRM contacts via Apollo bulk_match. Max 100 contacts.
  // Skips contacts that already have enrichmentData (unless force=true).
  server.post(
    "/enrich-bulk",
    { preHandler: authorize("ADMIN", "MANAGER", "BD_STAFF") },
    async (request) => {
      const { contactIds, force } = bulkEnrichSchema.parse(request.body);

      const contacts = await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        include: { company: { select: { name: true } } },
      });

      if (contacts.length === 0) {
        return { error: "No contacts found for given IDs" };
      }

      // Filter out already-enriched contacts (unless force)
      const toEnrich = force
        ? contacts
        : contacts.filter((c) => !c.enrichmentData);

      if (toEnrich.length === 0) {
        return {
          enriched: 0,
          skippedCached: contacts.length,
          creditsConsumed: 0,
          fieldsUpdated: 0,
          errors: [],
        };
      }

      const results = {
        enriched: 0,
        skippedCached: contacts.length - toEnrich.length,
        creditsConsumed: 0,
        fieldsUpdated: 0,
        errors: [] as string[],
      };

      const batches = chunk(toEnrich, 10);

      for (const batch of batches) {
        try {
          // Build details: prefer Apollo ID, fallback to name + company
          const details = batch.map((c) => {
            if (c.apolloContactId) {
              return { id: c.apolloContactId };
            }
            const nameParts = c.fullName.split(" ");
            const detail: Record<string, string> = {};
            detail.first_name = nameParts[0] ?? "";
            if (nameParts.length > 1) detail.last_name = nameParts.slice(1).join(" ");
            detail.organization_name = c.company.name;
            if (c.email) detail.email = c.email;
            if (c.linkedin) detail.linkedin_url = c.linkedin;
            return detail;
          });

          const enrichResult = await bulkEnrichPeople(details);
          results.creditsConsumed += enrichResult.credits_consumed ?? 0;

          // Build match lookup — by Apollo ID first, then by name fuzzy
          const matches = enrichResult.matches ?? [];

          for (let i = 0; i < batch.length; i++) {
            const contact = batch[i];
            let person: ApolloPersonResult | undefined;

            if (contact.apolloContactId) {
              person = matches.find((m) => m.id === contact.apolloContactId);
            }
            // Fallback: match by position in details array (bulk_match preserves order)
            if (!person && matches[i]) {
              person = matches[i];
            }

            if (!person) continue;

            results.enriched++;

            const updateData = buildEnrichmentUpdate(person, {
              email: contact.email,
              linkedin: contact.linkedin,
              position: contact.position,
              phone: contact.phone,
              fullName: contact.fullName,
            });

            // Also save apolloContactId if not already set
            if (!contact.apolloContactId && person.id) {
              updateData.apolloContactId = person.id;
            }

            const fieldsUpdated = Object.keys(updateData).filter(
              (k) => k !== "enrichmentData"
            );
            results.fieldsUpdated += fieldsUpdated.length;

            await prisma.contact.update({
              where: { id: contact.id },
              data: updateData as any,
            });
          }
        } catch (err) {
          results.errors.push(
            `Batch failed: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }

      return results;
    }
  );
}
