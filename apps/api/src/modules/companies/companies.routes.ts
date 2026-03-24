import type { FastifyInstance } from "fastify";
import { prisma, Prisma } from "@xperise/database";
import { createCompanySchema, updateCompanySchema, companyFilterSchema } from "@xperise/shared";
import { authenticate, authorize } from "../../common/auth-guard";
import { getPagination, formatPaginatedResponse } from "../../common/pagination";
import { createAuditLog } from "../../common/audit";

export async function companyRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // GET /companies
  server.get("/", async (request) => {
    const filters = companyFilterSchema.parse(request.query);
    const { skip, take } = getPagination(filters.page, filters.limit);

    const where: Prisma.CompanyWhereInput = {};

    if (filters.search) {
      where.name = { contains: filters.search, mode: "insensitive" };
    }
    if (filters.industry) {
      where.industry = filters.industry as Prisma.EnumIndustryFilter;
    }
    if (filters.size) {
      where.size = filters.size as any;
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take,
        orderBy: { [filters.sortBy]: filters.sortOrder },
        include: {
          _count: { select: { contacts: true, pipelines: true } },
        },
      }),
      prisma.company.count({ where }),
    ]);

    return formatPaginatedResponse(companies, total, filters.page, filters.limit);
  });

  // GET /companies/:id — Full company profile with stakeholders, activity, pipelines
  server.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const company = await prisma.company.findUnique({
      where: { id: request.params.id },
      include: {
        contacts: {
          include: {
            assignedTo: { select: { id: true, name: true } },
          },
          orderBy: { priority: "asc" },
        },
        pipelines: {
          include: {
            pic: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!company) {
      return reply.status(404).send({ error: "Company not found" });
    }

    // Activity timeline — last 30 actions across all contacts of this company
    const contactIds = company.contacts.map((c) => c.id);
    const [recentActions, emailLogs] = await Promise.all([
      contactIds.length > 0
        ? prisma.contactAction.findMany({
            where: { contactId: { in: contactIds } },
            orderBy: { performedAt: "desc" },
            take: 30,
            include: {
              contact: { select: { id: true, fullName: true } },
              performedBy: { select: { id: true, name: true } },
            },
          })
        : [],
      contactIds.length > 0
        ? prisma.emailLog.findMany({
            where: { contactId: { in: contactIds } },
            orderBy: { sentAt: "desc" },
            take: 20,
            select: {
              id: true,
              subject: true,
              status: true,
              sentAt: true,
              openedAt: true,
              repliedAt: true,
              bouncedAt: true,
              contactId: true,
              contact: { select: { fullName: true } },
            },
          })
        : [],
    ]);

    // Compute effective company stage (highest stage among contacts)
    const stageOrder = [
      "NO_CONTACT", "CONTACT", "REACHED", "FOLLOW_UP",
      "MEETING_BOOKED", "MET", "CONVERTED",
    ];
    let effectiveStage = "NO_CONTACT";
    for (const contact of company.contacts) {
      const idx = stageOrder.indexOf(contact.contactStatus);
      if (idx > stageOrder.indexOf(effectiveStage)) {
        effectiveStage = contact.contactStatus;
      }
    }
    // NURTURE/LOST don't advance the company stage — only count active statuses
    const activeContacts = company.contacts.filter(
      (c) => !["NURTURE", "LOST"].includes(c.contactStatus)
    );
    if (activeContacts.length === 0 && company.contacts.length > 0) {
      // All contacts are nurture/lost
      const hasNurture = company.contacts.some((c) => c.contactStatus === "NURTURE");
      effectiveStage = hasNurture ? "NURTURE" : "LOST";
    }

    // Days in current effective stage
    const latestStageChange = company.contacts.reduce((latest, c) => {
      const d = c.stageChangedAt ?? c.createdAt;
      return d > latest ? d : latest;
    }, company.createdAt);
    const daysInStage = Math.floor(
      (Date.now() - new Date(latestStageChange).getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      company: {
        ...company,
        pipelines: company.pipelines.map((p) => ({
          ...p,
          totalRevenue: p.totalRevenue.toString(),
        })),
      },
      effectiveStage,
      daysInStage,
      recentActions,
      emailLogs,
    };
  });

  // POST /companies (Admin/Manager)
  server.post(
    "/",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const data = createCompanySchema.parse(request.body);

      const company = await prisma.company.create({ data });

      await createAuditLog({
        userId: request.user.id,
        action: "create",
        entity: "company",
        entityId: company.id,
      });

      return { company };
    }
  );

  // PUT /companies/:id
  server.put<{ Params: { id: string } }>(
    "/:id",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request, reply) => {
      const data = updateCompanySchema.parse(request.body);

      const existing = await prisma.company.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Company not found" });
      }

      const company = await prisma.company.update({
        where: { id: request.params.id },
        data,
      });

      await createAuditLog({
        userId: request.user.id,
        action: "update",
        entity: "company",
        entityId: company.id,
      });

      return { company };
    }
  );
}
