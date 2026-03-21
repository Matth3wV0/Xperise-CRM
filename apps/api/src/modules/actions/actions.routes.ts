import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { z } from "zod";
import { authenticate, authorize } from "../../common/auth-guard";

const createActionSchema = z.object({
  type: z.enum([
    "EMAIL_SENT", "EMAIL_FOLLOW_UP", "LINKEDIN_MESSAGE", "LINKEDIN_CONNECT",
    "PHONE_CALL", "MEETING", "NOTE", "STATUS_CHANGE", "OTHER",
  ]),
  status: z.enum(["DONE", "FOLLOW_UP", "PENDING", "NOT_STARTED"]).default("DONE"),
  note: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function actionRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // GET /contacts/:contactId/actions
  server.get<{ Params: { contactId: string } }>(
    "/:contactId/actions",
    async (request, reply) => {
      const contact = await prisma.contact.findUnique({
        where: { id: request.params.contactId },
      });

      if (!contact) {
        return reply.status(404).send({ error: "Contact not found" });
      }

      const actions = await prisma.contactAction.findMany({
        where: { contactId: request.params.contactId },
        orderBy: { performedAt: "desc" },
        include: {
          performedBy: { select: { id: true, name: true } },
        },
      });

      return { actions };
    }
  );

  // POST /contacts/:contactId/actions
  server.post<{ Params: { contactId: string } }>(
    "/:contactId/actions",
    { preHandler: authorize("ADMIN", "MANAGER", "BD_STAFF") },
    async (request, reply) => {
      const data = createActionSchema.parse(request.body);

      const contact = await prisma.contact.findUnique({
        where: { id: request.params.contactId },
      });

      if (!contact) {
        return reply.status(404).send({ error: "Contact not found" });
      }

      const [action] = await prisma.$transaction([
        prisma.contactAction.create({
          data: {
            ...data,
            metadata: data.metadata as any,
            contactId: request.params.contactId,
            performedById: request.user.id,
          },
          include: {
            performedBy: { select: { id: true, name: true } },
          },
        }),
        prisma.contact.update({
          where: { id: request.params.contactId },
          data: { lastTouchedAt: new Date() },
        }),
      ]);

      return { action };
    }
  );
}
