import type { Context } from "grammy";
import { prisma } from "@xperise/database";
import { rp } from "../lib/rp.js";
import {
  STATUS_LABELS,
  STATUS_EMOJI,
  daysSince,
  COLD_DAYS_THRESHOLD,
} from "../lib/formatter.js";

export async function handleMine(ctx: Context) {
  const telegramId = String(ctx.from?.id);

  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, name: true } } },
  });

  if (!binding) {
    await ctx.reply("Bạn chưa link tài khoản. Dùng /start để xem hướng dẫn.", { ...rp(ctx) });
    return;
  }

  const contacts = await prisma.contact.findMany({
    where: { assignedToId: binding.user.id },
    include: {
      company: { select: { name: true } },
    },
    orderBy: [{ lastTouchedAt: "desc" }, { priority: "desc" }],
    take: 20,
  });

  if (contacts.length === 0) {
    await ctx.reply("Bạn chưa được assign contact nào. Liên hệ Manager để được phân công.", { ...rp(ctx) });
    return;
  }

  let msg = `📋 <b>Contacts của ${binding.user.name}</b> (${contacts.length}):\n\n`;

  for (const c of contacts) {
    const emoji = STATUS_EMOJI[c.contactStatus] ?? "⚪";
    const label = STATUS_LABELS[c.contactStatus] ?? c.contactStatus;
    const days = daysSince(c.lastTouchedAt);
    const coldWarning = days >= COLD_DAYS_THRESHOLD ? ` 🥶 ${days}d` : "";

    msg += `${emoji} <b>${c.company.name}</b> — ${c.fullName}\n`;
    msg += `   ${label}${coldWarning}\n`;
  }

  msg += `\n<i>Dùng /cold để xem leads nguội, /status [company] để xem chi tiết.</i>`;

  await ctx.reply(msg, { ...rp(ctx), parse_mode: "HTML" });
}
