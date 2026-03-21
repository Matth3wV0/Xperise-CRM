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

  // GET /companies/:id
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

    return { company };
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
