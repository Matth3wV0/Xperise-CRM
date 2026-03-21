import type { FastifyInstance } from "fastify";
import { prisma, Prisma } from "@xperise/database";
import {
  createContactSchema,
  updateContactSchema,
  contactFilterSchema,
  bulkStatusSchema,
  bulkAssignSchema,
} from "@xperise/shared";
import { authenticate, authorize } from "../../common/auth-guard";
import { getPagination, formatPaginatedResponse } from "../../common/pagination";
import { createAuditLog } from "../../common/audit";

export async function contactRoutes(server: FastifyInstance) {
  // All routes require authentication
  server.addHook("preHandler", authenticate);

  // GET /contacts
  server.get("/", async (request) => {
    const filters = contactFilterSchema.parse(request.query);
    const { skip, take } = getPagination(filters.page, filters.limit);

    const where: Prisma.ContactWhereInput = {};

    if (filters.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { company: { name: { contains: filters.search, mode: "insensitive" } } },
      ];
    }
    if (filters.contactStatus) {
      where.contactStatus = filters.contactStatus as Prisma.EnumContactStatusFilter;
    }
    if (filters.priority) {
      where.priority = filters.priority;
    }
    if (filters.type) {
      where.type = filters.type as Prisma.EnumContactTypeFilter;
    }
    if (filters.source) {
      where.source = filters.source as Prisma.EnumContactSourceFilter;
    }
    if (filters.companyId) {
      where.companyId = filters.companyId;
    }
    if (filters.industry) {
      where.company = { industry: filters.industry as Prisma.EnumIndustryFilter };
    }

    // BD_STAFF can only see assigned contacts
    if (request.user.role === "BD_STAFF") {
      where.assignedToId = request.user.id;
    } else if (filters.assignedToId) {
      where.assignedToId = filters.assignedToId;
    }

    const orderBy: Prisma.ContactOrderByWithRelationInput = {
      [filters.sortBy]: filters.sortOrder,
    };

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          company: { select: { id: true, name: true, industry: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      }),
      prisma.contact.count({ where }),
    ]);

    return formatPaginatedResponse(contacts, total, filters.page, filters.limit);
  });

  // GET /contacts/:id
  server.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const contact = await prisma.contact.findUnique({
      where: { id: request.params.id },
      include: {
        company: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        actions: {
          orderBy: { performedAt: "desc" },
          take: 20,
          include: {
            performedBy: { select: { id: true, name: true } },
          },
        },
        emailLogs: {
          orderBy: { sentAt: "desc" },
          take: 10,
        },
      },
    });

    if (!contact) {
      return reply.status(404).send({ error: "Contact not found" });
    }

    return { contact };
  });

  // POST /contacts
  server.post(
    "/",
    { preHandler: authorize("ADMIN", "MANAGER", "BD_STAFF") },
    async (request) => {
      const data = createContactSchema.parse(request.body);

      const contact = await prisma.contact.create({
        data,
        include: {
          company: { select: { id: true, name: true } },
        },
      });

      await createAuditLog({
        userId: request.user.id,
        action: "create",
        entity: "contact",
        entityId: contact.id,
      });

      return { contact };
    }
  );

  // PUT /contacts/:id
  server.put<{ Params: { id: string } }>(
    "/:id",
    { preHandler: authorize("ADMIN", "MANAGER", "BD_STAFF") },
    async (request, reply) => {
      const data = updateContactSchema.parse(request.body);

      const existing = await prisma.contact.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Contact not found" });
      }

      // BD_STAFF can only edit assigned contacts
      if (request.user.role === "BD_STAFF" && existing.assignedToId !== request.user.id) {
        return reply.status(403).send({ error: "Can only edit assigned contacts" });
      }

      const contact = await prisma.contact.update({
        where: { id: request.params.id },
        data,
        include: {
          company: { select: { id: true, name: true } },
        },
      });

      await createAuditLog({
        userId: request.user.id,
        action: "update",
        entity: "contact",
        entityId: contact.id,
      });

      return { contact };
    }
  );

  // DELETE /contacts/:id (Admin/Manager only)
  server.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request, reply) => {
      const existing = await prisma.contact.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Contact not found" });
      }

      await prisma.contact.delete({
        where: { id: request.params.id },
      });

      await createAuditLog({
        userId: request.user.id,
        action: "delete",
        entity: "contact",
        entityId: request.params.id,
      });

      return { success: true };
    }
  );

  // POST /contacts/bulk-status
  server.post(
    "/bulk-status",
    { preHandler: authorize("ADMIN", "MANAGER", "BD_STAFF") },
    async (request) => {
      const { contactIds, contactStatus } = bulkStatusSchema.parse(request.body);

      await prisma.contact.updateMany({
        where: { id: { in: contactIds } },
        data: { contactStatus },
      });

      return { updated: contactIds.length };
    }
  );

  // POST /contacts/bulk-assign
  server.post(
    "/bulk-assign",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const { contactIds, assignedToId } = bulkAssignSchema.parse(request.body);

      await prisma.contact.updateMany({
        where: { id: { in: contactIds } },
        data: { assignedToId },
      });

      return { updated: contactIds.length };
    }
  );
}
