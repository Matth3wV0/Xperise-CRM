import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { z } from "zod";
import { authenticate, authorize } from "../../common/auth-guard";
import { sendTelegramMessage } from "../../common/telegram-notify";

const createCampaignSchema = z.object({
  name: z.string().min(1),
  steps: z.array(
    z.object({
      stepOrder: z.number().int().min(0),
      delayDays: z.number().int().min(0).default(0),
      subject: z.string().min(1),
      body: z.string().min(1),
    })
  ).min(1),
  recipientContactIds: z.array(z.string()).optional(),
});

const addRecipientsSchema = z.object({
  contactIds: z.array(z.string()).min(1),
});

export async function campaignRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // ── GET /campaigns ──────────────────────────────────────────────────────────
  server.get("/", async (request) => {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        steps: { orderBy: { stepOrder: "asc" } },
        _count: { select: { recipients: true, emailLogs: true } },
      },
    });

    // Attach simple stats
    const result = await Promise.all(
      campaigns.map(async (c) => {
        const stats = await prisma.campaignRecipient.groupBy({
          by: ["status"],
          where: { campaignId: c.id },
          _count: true,
        });

        const statusCounts: Record<string, number> = {};
        for (const s of stats) {
          statusCounts[s.status] = s._count;
        }

        return {
          ...c,
          totalRecipients: c._count.recipients,
          totalEmails: c._count.emailLogs,
          statusCounts,
        };
      })
    );

    return { campaigns: result };
  });

  // ── POST /campaigns ─────────────────────────────────────────────────────────
  server.post(
    "/",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const data = createCampaignSchema.parse(request.body);

      const campaign = await prisma.campaign.create({
        data: {
          name: data.name,
          createdById: request.user.id,
          steps: {
            create: data.steps.map((step) => ({
              stepOrder: step.stepOrder,
              delayDays: step.delayDays,
              subject: step.subject,
              body: step.body,
            })),
          },
          ...(data.recipientContactIds?.length
            ? {
                recipients: {
                  create: data.recipientContactIds.map((contactId) => ({
                    contactId,
                    status: "DRAFT",
                  })),
                },
              }
            : {}),
        },
        include: {
          steps: { orderBy: { stepOrder: "asc" } },
          recipients: { include: { contact: { select: { id: true, fullName: true, email: true } } } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      return { campaign };
    }
  );

  // ── GET /campaigns/:id ──────────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: request.params.id },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        recipients: {
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                email: true,
                position: true,
                company: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        createdBy: { select: { id: true, name: true } },
        emailLogs: {
          orderBy: { sentAt: "desc" },
          take: 50,
          include: {
            contact: { select: { fullName: true } },
          },
        },
      },
    });

    if (!campaign) {
      return reply.status(404).send({ error: "Campaign not found" });
    }

    return { campaign };
  });

  // ── POST /campaigns/:id/recipients ──────────────────────────────────────────
  server.post<{ Params: { id: string } }>(
    "/:id/recipients",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request, reply) => {
      const { contactIds } = addRecipientsSchema.parse(request.body);

      const campaign = await prisma.campaign.findUnique({
        where: { id: request.params.id },
      });
      if (!campaign) {
        return reply.status(404).send({ error: "Campaign not found" });
      }

      // Filter out already added recipients
      const existing = await prisma.campaignRecipient.findMany({
        where: {
          campaignId: campaign.id,
          contactId: { in: contactIds },
        },
        select: { contactId: true },
      });
      const existingIds = new Set(existing.map((r) => r.contactId));
      const newIds = contactIds.filter((id) => !existingIds.has(id));

      if (newIds.length === 0) {
        return { added: 0, skipped: contactIds.length };
      }

      await prisma.campaignRecipient.createMany({
        data: newIds.map((contactId) => ({
          campaignId: campaign.id,
          contactId,
          status: "DRAFT",
        })),
      });

      return { added: newIds.length, skipped: existingIds.size };
    }
  );

  // ── POST /campaigns/:id/launch ──────────────────────────────────────────────
  server.post<{ Params: { id: string } }>(
    "/:id/launch",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request, reply) => {
      const campaign = await prisma.campaign.findUnique({
        where: { id: request.params.id },
        include: {
          recipients: true,
          steps: { orderBy: { stepOrder: "asc" }, take: 1 },
        },
      });

      if (!campaign) {
        return reply.status(404).send({ error: "Campaign not found" });
      }

      if (campaign.status !== "DRAFT" && campaign.status !== "PAUSED") {
        return reply
          .status(400)
          .send({ error: `Campaign is already ${campaign.status}` });
      }

      if (campaign.recipients.length === 0) {
        return reply.status(400).send({ error: "No recipients in campaign" });
      }

      // Set all DRAFT recipients to PENDING_APPROVAL
      await prisma.$transaction([
        prisma.campaignRecipient.updateMany({
          where: { campaignId: campaign.id, status: "DRAFT" },
          data: { status: "PENDING_APPROVAL", nextSendAt: new Date() },
        }),
        prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "ACTIVE" },
        }),
      ]);

      const queuedCount = campaign.recipients.filter(
        (r) => r.status === "DRAFT"
      ).length;

      // Notify Telegram group about pending approvals
      if (queuedCount > 0) {
        const recipientList = await prisma.campaignRecipient.findMany({
          where: { campaignId: campaign.id, status: "PENDING_APPROVAL" },
          include: {
            contact: {
              select: {
                fullName: true,
                position: true,
                company: { select: { name: true } },
              },
            },
          },
          take: 10,
        });

        let msg =
          `📧 <b>CAMPAIGN LAUNCHED: "${campaign.name}"</b>\n` +
          `${queuedCount} email(s) chờ duyệt:\n` +
          `━━━━━━━━━━━━━━━━━━\n`;

        for (const r of recipientList) {
          const c = r.contact;
          msg += `• <b>${c.fullName}</b>${c.position ? ` — ${c.position}` : ""} @ ${c.company.name}\n`;
        }
        if (queuedCount > 10) {
          msg += `... và ${queuedCount - 10} người khác\n`;
        }
        msg +=
          `━━━━━━━━━━━━━━━━━━\n` +
          `Dùng <code>/approve ${campaign.id}</code> để duyệt tất cả\n` +
          `Hoặc <code>/reject ${campaign.id} [lý do]</code> để từ chối`;

        await sendTelegramMessage(msg, {
          inlineKeyboard: [
            [
              { text: "✅ Approve All", callback_data: `ca:${campaign.id}` },
              { text: "❌ Reject All", callback_data: `cr:${campaign.id}` },
            ],
          ],
        });
      }

      return {
        launched: true,
        recipientsQueued: queuedCount,
        message:
          "Campaign launched. Recipients set to PENDING_APPROVAL. Telegram notified.",
      };
    }
  );

  // ── POST /campaigns/:id/pause ───────────────────────────────────────────────
  server.post<{ Params: { id: string } }>(
    "/:id/pause",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request, reply) => {
      const campaign = await prisma.campaign.findUnique({
        where: { id: request.params.id },
      });

      if (!campaign) {
        return reply.status(404).send({ error: "Campaign not found" });
      }

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "PAUSED" },
      });

      return { paused: true };
    }
  );
}
