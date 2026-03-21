import type { Context } from "grammy";
import { prisma } from "@xperise/database";
import { STATUS_LABELS, STATUS_EMOJI } from "../lib/formatter.js";

export async function handleCallback(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

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
