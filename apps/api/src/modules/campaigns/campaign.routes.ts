import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { z } from "zod";
import { authenticate, authorize } from "../../common/auth-guard";
import { sendTelegramMessage } from "../../common/telegram-notify";
import {
  createApolloContact,
  addContactsToSequence,
  searchSequences,
  getEmailAccounts,
} from "../apollo/apollo-sequences.service";

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

  // ── POST /campaigns/:id/link-sequence ─────────────────────────────────────
  // Link a CRM campaign to an existing Apollo sequence (created in Apollo UI)
  const linkSequenceSchema = z.object({
    apolloSequenceId: z.string().min(1),
  });

  server.post<{ Params: { id: string } }>(
    "/:id/link-sequence",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request, reply) => {
      const { apolloSequenceId } = linkSequenceSchema.parse(request.body);

      const campaign = await prisma.campaign.findUnique({
        where: { id: request.params.id },
      });
      if (!campaign) {
        return reply.status(404).send({ error: "Campaign not found" });
      }

      // Verify sequence exists in Apollo
      try {
        const result = await searchSequences();
        const found = result.emailer_campaigns?.find(
          (s) => s.id === apolloSequenceId
        );
        if (!found) {
          return reply.status(400).send({
            error: "Apollo sequence not found. Check the ID in Apollo dashboard.",
          });
        }
      } catch (err) {
        return reply.status(502).send({
          error: `Failed to verify Apollo sequence: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { apolloSequenceId },
      });

      return { linked: true, apolloSequenceId };
    }
  );

  // ── GET /campaigns/apollo-sequences ───────────────────────────────────────
  // List available Apollo sequences for linking
  server.get(
    "/apollo-sequences",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (_request, reply) => {
      try {
        const result = await searchSequences();
        return {
          sequences: (result.emailer_campaigns ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            active: s.active,
            numSteps: s.num_steps,
          })),
        };
      } catch (err) {
        return reply.status(502).send({
          error: `Failed to fetch Apollo sequences: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }
  );

  // ── GET /campaigns/apollo-email-accounts ──────────────────────────────────
  // List Apollo linked email accounts (for choosing sender)
  server.get(
    "/apollo-email-accounts",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (_request, reply) => {
      try {
        const result = await getEmailAccounts();
        return {
          emailAccounts: (result.email_accounts ?? [])
            .filter((a) => a.active)
            .map((a) => ({ id: a.id, email: a.email, type: a.type })),
        };
      } catch (err) {
        return reply.status(502).send({
          error: `Failed to fetch Apollo email accounts: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }
  );

  // ── POST /campaigns/:id/sync-apollo ───────────────────────────────────────
  // Sync APPROVED recipients to Apollo sequence:
  //  1. Ensure each contact exists in Apollo (create if missing)
  //  2. Add contacts to the linked Apollo sequence
  //  3. Update CampaignRecipient status to SENDING
  const syncApolloSchema = z.object({
    emailAccountId: z.string().optional(), // Apollo email account to send from
  });

  server.post<{ Params: { id: string } }>(
    "/:id/sync-apollo",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request, reply) => {
      const body = (request.body && typeof request.body === "object") ? request.body : {};
      const { emailAccountId } = syncApolloSchema.parse(body);

      const campaign = await prisma.campaign.findUnique({
        where: { id: request.params.id },
        include: {
          recipients: {
            where: { status: "APPROVED" },
            include: {
              contact: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  phone: true,
                  position: true,
                  linkedin: true,
                  apolloContactId: true,
                  company: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      if (!campaign) {
        return reply.status(404).send({ error: "Campaign not found" });
      }
      if (!campaign.apolloSequenceId) {
        return reply.status(400).send({
          error:
            "Campaign not linked to an Apollo sequence. Use POST /campaigns/:id/link-sequence first.",
        });
      }
      if (campaign.recipients.length === 0) {
        return reply
          .status(400)
          .send({ error: "No APPROVED recipients to sync" });
      }

      const results = {
        synced: 0,
        apolloContactsCreated: 0,
        errors: [] as string[],
      };

      // Step 1: Ensure all contacts exist in Apollo
      const apolloContactIds: string[] = [];

      for (const recipient of campaign.recipients) {
        const contact = recipient.contact;

        // Skip contacts without email (Apollo requires email for sequences)
        if (!contact.email) {
          results.errors.push(
            `${contact.fullName}: no email — skipped`
          );
          continue;
        }

        let apolloContactId = contact.apolloContactId;

        if (!apolloContactId) {
          // Create contact in Apollo
          try {
            const nameParts = contact.fullName.split(" ");
            const firstName = nameParts[0] ?? "";
            const lastName = nameParts.slice(1).join(" ") || firstName;

            const apolloResult = await createApolloContact({
              firstName,
              lastName,
              email: contact.email,
              title: contact.position ?? undefined,
              organizationName: contact.company.name,
              linkedinUrl: contact.linkedin ?? undefined,
              phone: contact.phone ?? undefined,
            });

            apolloContactId = apolloResult.contact?.id;
            if (!apolloContactId) {
              results.errors.push(
                `${contact.fullName}: Apollo returned no contact ID`
              );
              continue;
            }

            // Save Apollo contact ID to our DB
            await prisma.contact.update({
              where: { id: contact.id },
              data: { apolloContactId },
            });
            results.apolloContactsCreated++;
          } catch (err) {
            results.errors.push(
              `${contact.fullName}: Apollo create failed — ${err instanceof Error ? err.message : "Unknown error"}`
            );
            continue;
          }
        }

        apolloContactIds.push(apolloContactId);
      }

      if (apolloContactIds.length === 0) {
        return reply.status(400).send({
          error: "No contacts could be synced to Apollo",
          details: results.errors,
        });
      }

      // Step 2: Add contacts to Apollo sequence
      try {
        await addContactsToSequence(
          campaign.apolloSequenceId,
          apolloContactIds,
          emailAccountId
        );
      } catch (err) {
        return reply.status(502).send({
          error: `Failed to add contacts to Apollo sequence: ${err instanceof Error ? err.message : "Unknown error"}`,
          partialResults: results,
        });
      }

      // Step 3: Update recipient status to SENDING
      const syncedContactIds = campaign.recipients
        .filter((r) => {
          const cId = r.contact.apolloContactId ?? undefined;
          return cId && apolloContactIds.includes(cId);
        })
        .map((r) => r.contact.id);

      // Also include newly created Apollo contacts
      const allSyncedRecipientIds = campaign.recipients
        .filter((r) => r.contact.email && !results.errors.some((e) => e.startsWith(r.contact.fullName)))
        .map((r) => r.id);

      await prisma.campaignRecipient.updateMany({
        where: {
          id: { in: allSyncedRecipientIds },
          status: "APPROVED",
        },
        data: { status: "SENDING" },
      });
      results.synced = allSyncedRecipientIds.length;

      // Notify Telegram
      await sendTelegramMessage(
        `<b>Apollo Sync: "${campaign.name}"</b>\n` +
          `${results.synced} contacts synced to Apollo sequence\n` +
          `${results.apolloContactsCreated} new Apollo contacts created\n` +
          (results.errors.length > 0
            ? `${results.errors.length} errors (check API logs)`
            : "No errors"),
      );

      return results;
    }
  );
}
