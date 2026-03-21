import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { authenticate } from "../../common/auth-guard";

export async function notificationRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // GET /notifications
  server.get("/", async (request) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: request.user.id, read: false },
    });

    return { notifications, unreadCount };
  });

  // PUT /notifications/:id/read
  server.put<{ Params: { id: string } }>("/:id/read", async (request) => {
    await prisma.notification.update({
      where: { id: request.params.id },
      data: { read: true },
    });

    return { success: true };
  });

  // PUT /notifications/read-all
  server.put("/read-all", async (request) => {
    await prisma.notification.updateMany({
      where: { userId: request.user.id, read: false },
      data: { read: true },
    });

    return { success: true };
  });
}
