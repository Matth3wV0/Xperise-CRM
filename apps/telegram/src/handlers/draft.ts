import type { Context } from "grammy";
import { prisma } from "@xperise/database";
import { rp } from "../lib/rp.js";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

/**
 * /draft <contact name or ID> [angle]
 * Triggers the WRITER agent to draft an outreach email for a contact.
 * Sends the draft to the group for approval via inline buttons.
 */
export async function handleDraft(ctx: Context) {
  const telegramId = String(ctx.from?.id);
  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  if (!binding) {
    await ctx.reply("Ban chua link tai khoan. Dung /start de xem huong dan.", { ...rp(ctx) });
    return;
  }

  const args = ((ctx.match as string) ?? "").trim();
  if (!args) {
    await ctx.reply(
      "Vui long cung cap ten contact:\n" +
        "<code>/draft Nguyen Van A</code>\n" +
        "<code>/draft Nguyen Van A focus on digital transformation</code>",
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  // Parse: first part is contact name/ID, rest after known keywords is angle
  const parts = args.split(/\s+(?:focus|angle|about)\s+/i);
  const query = parts[0].trim();
  const angle = parts[1]?.trim();

  await ctx.replyWithChatAction("typing");

  // Find contact by ID or name
  let contact = await prisma.contact.findUnique({
    where: { id: query },
    select: { id: true, fullName: true, email: true },
  });

  if (!contact) {
    contact = await prisma.contact.findFirst({
      where: { fullName: { contains: query, mode: "insensitive" } },
      select: { id: true, fullName: true, email: true },
    });
  }

  if (!contact) {
    await ctx.reply(
      `❌ Khong tim thay contact: <b>${query}</b>\n\nThu ten khac hoac kiem tra trong web app.`,
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  if (!contact.email) {
    await ctx.reply(
      `⚠️ <b>${contact.fullName}</b> chua co email. Cap nhat email truoc khi draft.`,
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  try {
    await ctx.reply(
      `✍️ Dang soan email cho <b>${contact.fullName}</b>...`,
      { ...rp(ctx), parse_mode: "HTML" }
    );

    // Call the API's internal endpoint to trigger WRITER agent
    const res = await fetch(`${API_URL}/ai-agents/writer/draft-internal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        contactId: contact.id,
        angle,
        triggeredById: binding.user.id,
        trigger: "telegram:/draft",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[/draft] API error:", res.status, err);
      await ctx.reply("⚠️ Khong the ket noi WRITER agent. Vui long thu lai.", { ...rp(ctx) });
      return;
    }

    // The WRITER agent sends its own Telegram message with inline buttons — no need to reply again
  } catch (err) {
    console.error("[/draft] Error:", err);
    await ctx.reply("Co loi khi tao email draft. Vui long thu lai.", { ...rp(ctx) });
  }
}
