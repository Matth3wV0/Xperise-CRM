import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { prisma } from "@xperise/database";
import { authorize } from "../../common/auth-guard";
import * as XLSX from "xlsx";

// Map Excel industry strings to enum values
const INDUSTRY_MAP: Record<string, string> = {
  "Bank": "BANK",
  "Bank ": "BANK",
  "FMCG": "FMCG",
  "Media": "MEDIA",
  "Conglomerate": "CONGLOMERATE",
  "Tech & Durable": "TECH_DURABLE",
  "Pharma & Healthcare": "PHARMA_HEALTHCARE",
  "Manufacturing": "MANUFACTURING",
  "Others": "OTHERS",
};

const SOURCE_MAP: Record<string, string> = {
  "Current Xperise": "CURRENT_XPERISE",
  "Desk Research": "DESK_RESEARCH",
  "Ms. Nhi ": "PERSONAL_REFERRAL",
  "Personal - A Khai": "PERSONAL_REFERRAL",
  "Personal - A Dương": "PERSONAL_REFERRAL",
  "Personal Tai": "PERSONAL_REFERRAL",
};

const VERIFY_MAP: Record<string, string> = {
  "accept all": "ACCEPT_ALL",
  "valid": "VALID",
  "Valid": "VALID",
  "invalid": "INVALID",
  "unknown": "UNKNOWN",
};

const STATUS_MAP: Record<string, string> = {
  "0. No Contact": "NO_CONTACT",
  "1. Contact": "CONTACT",
  "2. Reached": "REACHED",
  "3. Follow-up": "FOLLOW_UP",
  "4. Meeting Booked": "MEETING_BOOKED",
  "5. Converted": "CONVERTED",
};

export async function importRoutes(server: FastifyInstance) {
  await server.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  // POST /import/excel (Admin only)
  server.post(
    "/excel",
    { preHandler: authorize("ADMIN") },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "No file uploaded" });
      }

      const buffer = await file.toBuffer();
      const workbook = XLSX.read(buffer, { type: "buffer" });

      // Parse "Lead contact" sheet
      const sheet = workbook.Sheets["Lead contact"];
      if (!sheet) {
        return reply.status(400).send({ error: "Sheet 'Lead contact' not found" });
      }

      const rawData = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
      }) as unknown as string[][];

      // Row 1 is header (index 1), data starts at row 2 (index 2)
      const headers = rawData[1];
      const rows = rawData.slice(2).filter((row) => row[1]); // Filter empty rows

      const companies = new Map<string, string>(); // name -> id
      let imported = 0;
      const errors: string[] = [];

      for (const row of rows) {
        try {
          const companyName = (row[2] ?? "").trim();
          const industry = INDUSTRY_MAP[(row[1] ?? "").trim()] ?? "OTHERS";

          if (!companyName) continue;

          // Get or create company
          if (!companies.has(companyName)) {
            const existing = await prisma.company.findFirst({
              where: { name: { equals: companyName, mode: "insensitive" } },
            });

            if (existing) {
              companies.set(companyName, existing.id);
            } else {
              const newCompany = await prisma.company.create({
                data: {
                  name: companyName,
                  industry: industry as any,
                  phone: (row[3] ?? "").trim() || undefined,
                },
              });
              companies.set(companyName, newCompany.id);
            }
          }

          const companyId = companies.get(companyName)!;
          const fullName = (row[7] ?? "").trim();

          if (!fullName) continue;

          // Check duplicate by name + company
          const existingContact = await prisma.contact.findFirst({
            where: {
              fullName: { equals: fullName, mode: "insensitive" },
              companyId,
            },
          });

          if (existingContact) continue; // Skip duplicates

          const priority = parseInt((row[5] ?? "3").replace("Priority ", "")) || 3;

          await prisma.contact.create({
            data: {
              fullName,
              position: (row[8] ?? "").trim() || undefined,
              email: (row[9] ?? "").trim() || undefined,
              phone: (row[15] ?? "").trim() || undefined,
              linkedin: (row[16] ?? "").trim() || undefined,
              source: (SOURCE_MAP[(row[4] ?? "").trim()] ?? "OTHER") as any,
              priority: Math.min(Math.max(priority, 1), 5),
              type: ((row[6] ?? "").trim() === "Sniping" ? "SNIPING" : "HUNTING") as any,
              contactStatus: (STATUS_MAP[(row[17] ?? "").trim()] ?? "NO_CONTACT") as any,
              emailVerify: (VERIFY_MAP[(row[10] ?? "").trim()] ?? "UNKNOWN") as any,
              companyId,
            },
          });

          imported++;
        } catch (err) {
          errors.push(`Row ${row[0]}: ${String(err)}`);
        }
      }

      return {
        imported,
        totalRows: rows.length,
        companiesCreated: companies.size,
        errors: errors.slice(0, 20), // Limit error output
      };
    }
  );
}
