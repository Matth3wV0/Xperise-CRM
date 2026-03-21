import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { authenticate, authorize } from "../../common/auth-guard";
import { randomBytes } from "crypto";

export async function telegramRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // POST /telegram/generate-code
  // Generate a 6-char bind code for the authenticated user (valid 10 min)
  server.post("/generate-code", async (request) => {
    const code = randomBytes(3).toString("hex").toUpperCase(); // e.g. "A3F9C1"
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: request.user.id },
      data: {
        telegramBindCode: code,
        telegramBindCodeExpiry: expiry,
      },
    });

    return { code, expiresAt: expiry.toISOString() };
  });

  // GET /telegram/status
  // Check if current user has a Telegram binding
  server.get("/status", async (request) => {
    const binding = await prisma.telegramBinding.findUnique({
      where: { userId: request.user.id },
      select: {
        telegramName: true,
        boundAt: true,
      },
    });

    return {
      bound: !!binding,
      telegramName: binding?.telegramName ?? null,
      boundAt: binding?.boundAt ?? null,
    };
  });

  // DELETE /telegram/unbind (Admin only — unbind any user)
  server.delete<{ Params: { userId: string } }>(
    "/unbind/:userId",
    { preHandler: authorize("ADMIN") },
    async (request, reply) => {
      const { userId } = request.params;

      const deleted = await prisma.telegramBinding.deleteMany({
        where: { userId },
      });

      if (deleted.count === 0) {
        return reply.status(404).send({ error: "No binding found for this user" });
      }

      return { success: true };
    }
  );
}
