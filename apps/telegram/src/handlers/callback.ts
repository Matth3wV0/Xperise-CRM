import type { Context } from "grammy";
import { prisma } from "@xperise/database";
import { STATUS_LABELS, STATUS_EMOJI } from "../lib/formatter.js";
import { handleCampaignCallback } from "./approve.js";

export async function handleCallback(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // ── Campaign approve/reject callbacks (ca:, cr:) ─────────────────────────
  if (data.startsWith("ca:") || data.startsWith("cr:")) {
    await handleCampaignCallback(ctx, data);
    return;
  }

  // ── Hunter agent import/skip callbacks (hi:, hs:) ─────────────────────────
  if (data.startsWith("hi:") || data.startsWith("hs:")) {
    await ctx.answerCallbackQuery();
    const agentRunId = data.slice(3);
    const isImport = data.startsWith("hi:");

    const telegramId = String(ctx.from?.id);
    const binding = await prisma.telegramBinding.findUnique({
      where: { telegramId },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    if (!binding || !["ADMIN", "MANAGER"].includes(binding.user.role)) {
      const original = ctx.callbackQuery?.message?.text ?? "";
      await ctx.editMessageText(original + "\n\n⛔ Chỉ ADMIN/MANAGER mới có thể thực hiện.", {
        parse_mode: "HTML",
      });
      return;
    }

    const original = ctx.callbackQuery?.message?.text ?? "";
    const preview = original.split("\nImport")[0];

    if (isImport) {
      // Import leads via API call
      const action = await prisma.agentAction.findFirst({
        where: { agentRunId, actionType: "save_leads", status: "PENDING_APPROVAL" },
      });

      if (!action) {
        await ctx.editMessageText(preview + "\n\n❌ Không tìm thấy leads để import.", {
          parse_mode: "HTML",
        });
        return;
      }

      const payload = action.payload as { leads: Array<Record<string, unknown>>; count: number };
      let imported = 0;

      for (const lead of payload.leads) {
        // Find or create company
        let companyId: string | undefined;
        if (lead.company) {
          const existing = await prisma.company.findFirst({
            where: { name: { equals: lead.company as string, mode: "insensitive" } },
          });
          companyId = existing?.id;
          if (!companyId) {
            const newCompany = await prisma.company.create({
              data: { name: lead.company as string, industry: "OTHERS" },
            });
            companyId = newCompany.id;
          }
        }

        // Check duplicate
        const existing = await prisma.contact.findFirst({
          where: {
            OR: [
              ...(lead.email ? [{ email: lead.email as string }] : []),
              { fullName: lead.name as string },
            ],
          },
        });
        if (existing) continue;

        await prisma.contact.create({
          data: {
            fullName: lead.name as string,
            email: (lead.email as string) ?? null,
            position: (lead.title as string) ?? null,
            companyId: companyId ?? "",
            source: "APOLLO",
            contactStatus: "NO_CONTACT",
            apolloContactId: (lead.apolloId as string) ?? null,
          },
        });
        imported++;
      }

      await prisma.agentAction.update({
        where: { id: action.id },
        data: { status: "EXECUTED", approvedById: binding.user.id, executedAt: new Date(), result: { imported } },
      });

      await ctx.editMessageText(
        preview + `\n\n✅ <b>${binding.user.name}</b> đã import ${imported} leads vào CRM.`,
        { parse_mode: "HTML" }
      );
    } else {
      // Skip — reject the action
      const action = await prisma.agentAction.findFirst({
        where: { agentRunId, actionType: "save_leads", status: "PENDING_APPROVAL" },
      });
      if (action) {
        await prisma.agentAction.update({
          where: { id: action.id },
          data: { status: "REJECTED", approvedById: binding.user.id },
        });
      }

      await ctx.editMessageText(
        preview + `\n\n⏭ <b>${binding.user.name}</b> đã bỏ qua.`,
        { parse_mode: "HTML" }
      );
    }
    return;
  }

  // ── Writer agent send/edit/skip callbacks (ws:, we:, wk:) ─────────────────
  if (data.startsWith("ws:") || data.startsWith("we:") || data.startsWith("wk:")) {
    await ctx.answerCallbackQuery();
    const agentRunId = data.slice(3);
    const action = data.substring(0, 2); // ws, we, wk

    const telegramId = String(ctx.from?.id);
    const binding = await prisma.telegramBinding.findUnique({
      where: { telegramId },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    if (!binding || !["ADMIN", "MANAGER"].includes(binding.user.role)) {
      const original = ctx.callbackQuery?.message?.text ?? "";
      await ctx.editMessageText(original + "\n\n⛔ Chỉ ADMIN/MANAGER mới có thể duyệt.", {
        parse_mode: "HTML",
      });
      return;
    }

    const original = ctx.callbackQuery?.message?.text ?? "";
    const preview = original.split("\nGửi email")[0];

    if (action === "ws") {
      // Send — approve and log as sent
      const agentAction = await prisma.agentAction.findFirst({
        where: { agentRunId, actionType: "draft_email", status: "PENDING_APPROVAL" },
      });

      if (!agentAction) {
        await ctx.editMessageText(preview + "\n\n❌ Draft không còn tồn tại.", { parse_mode: "HTML" });
        return;
      }

      const payload = agentAction.payload as { subject: string; email: string; contactName: string };

      // Create EmailLog + ContactAction
      if (agentAction.targetId) {
        await prisma.emailLog.create({
          data: {
            subject: payload.subject,
            body: (agentAction.payload as Record<string, unknown>).body as string,
            status: "SENT",
            contactId: agentAction.targetId,
            sentAt: new Date(),
            metadata: { source: "writer_agent", agentRunId },
          },
        });
        await prisma.contactAction.create({
          data: {
            type: "EMAIL_SENT",
            status: "DONE",
            note: `AI-drafted: "${payload.subject}"`,
            contactId: agentAction.targetId,
            performedById: binding.user.id,
            metadata: { agentRunId, aiDrafted: true },
          },
        });
        await prisma.contact.update({
          where: { id: agentAction.targetId },
          data: { lastTouchedAt: new Date() },
        });
      }

      await prisma.agentAction.update({
        where: { id: agentAction.id },
        data: { status: "EXECUTED", approvedById: binding.user.id, executedAt: new Date(), result: { sent: true } },
      });

      await ctx.editMessageText(
        preview + `\n\n✅ <b>${binding.user.name}</b> đã duyệt và gửi email.`,
        { parse_mode: "HTML" }
      );
    } else if (action === "we") {
      // Edit — mark as approved but needs manual edit
      const agentAction = await prisma.agentAction.findFirst({
        where: { agentRunId, actionType: "draft_email", status: "PENDING_APPROVAL" },
      });
      if (agentAction) {
        await prisma.agentAction.update({
          where: { id: agentAction.id },
          data: { status: "APPROVED", approvedById: binding.user.id },
        });
      }

      await ctx.editMessageText(
        preview + `\n\n✏️ <b>${binding.user.name}</b> sẽ chỉnh sửa và gửi thủ công.`,
        { parse_mode: "HTML" }
      );
    } else {
      // Skip
      const agentAction = await prisma.agentAction.findFirst({
        where: { agentRunId, actionType: "draft_email", status: "PENDING_APPROVAL" },
      });
      if (agentAction) {
        await prisma.agentAction.update({
          where: { id: agentAction.id },
          data: { status: "REJECTED", approvedById: binding.user.id },
        });
      }

      await ctx.editMessageText(
        preview + `\n\n⏭ <b>${binding.user.name}</b> đã bỏ qua draft này.`,
        { parse_mode: "HTML" }
      );
    }
    return;
  }

  // Always answer to remove the loading spinner
  await ctx.answerCallbackQuery();

  // ── Ignore / keep status ──────────────────────────────────────────────────
  if (data.startsWith("ig:")) {
    const originalText = ctx.callbackQuery?.message?.text ?? "";
    await ctx.editMessageText(originalText + "\n\n✓ Status giữ nguyên.", {
      parse_mode: "HTML",
    });
    return;
  }

  // ── Status update: su:{contactId}:{newStatus} ─────────────────────────────
  if (data.startsWith("su:")) {
    const parts = data.split(":");
    if (parts.length < 3) return;

    const contactId = parts[1];
    const newStatus = parts[2];

    const telegramId = String(ctx.from?.id);
    const binding = await prisma.telegramBinding.findUnique({
      where: { telegramId },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!binding) {
      await ctx.answerCallbackQuery("Bạn chưa link tài khoản.");
      return;
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { company: { select: { name: true } } },
    });

    if (!contact) return;

    const oldStatus = contact.contactStatus;

    await prisma.$transaction([
      prisma.contact.update({
        where: { id: contactId },
        data: { contactStatus: newStatus as any, lastTouchedAt: new Date() },
      }),
      prisma.contactAction.create({
        data: {
          type: "STATUS_CHANGE",
          status: "DONE",
          note: `Status: ${STATUS_LABELS[oldStatus] ?? oldStatus} → ${STATUS_LABELS[newStatus] ?? newStatus}`,
          contactId,
          performedById: binding.user.id,
          metadata: { oldStatus, newStatus, source: "telegram" },
        },
      }),
    ]);

    const emoji = STATUS_EMOJI[newStatus] ?? "⚪";
    const label = STATUS_LABELS[newStatus] ?? newStatus;

    // Edit the original message to reflect the update
    const originalText = ctx.callbackQuery?.message?.text ?? "";
    const textBeforeStatusLine = originalText.split("\nMuốn cập nhật")[0];

    await ctx.editMessageText(
      textBeforeStatusLine + `\n\n${emoji} Status cập nhật: <b>${label}</b>`,
      { parse_mode: "HTML" }
    );
    return;
  }
}
