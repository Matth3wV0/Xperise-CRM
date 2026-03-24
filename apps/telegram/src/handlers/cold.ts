import type { Context } from "grammy";
import { prisma } from "@xperise/database";
import {
  STATUS_LABELS,
  daysSince,
  formatDate,
  COLD_DAYS_THRESHOLD,
} from "../lib/formatter.js";

export async function handleCold(ctx: Context) {
  const telegramId = String(ctx.from?.id);

  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  if (!binding) {
    await ctx.reply("Bạn chưa link tài khoản. Dùng /start để xem hướng dẫn.");
    return;
  }

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - COLD_DAYS_THRESHOLD);

  // BD_STAFF sees only their contacts; Admin/Manager sees all
  const assignFilter =
    binding.user.role === "BD_STAFF"
      ? { assignedToId: binding.user.id }
      : {};

  const contacts = await prisma.contact.findMany({
    where: {
      ...assignFilter,
      contactStatus: { notIn: ["CONVERTED", "NO_CONTACT", "LOST"] as any[] },
      OR: [
        { lastTouchedAt: { lt: thresholdDate } },
        { lastTouchedAt: null },
      ],
    },
    include: {
      company: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: { lastTouchedAt: "asc" },
    take: 20,
  });

  if (contacts.length === 0) {
    await ctx.reply("✅ Không có cold leads! Team đang làm tốt 💪");
    return;
  }

  let msg = `🥶 <b>Cold Leads (> ${COLD_DAYS_THRESHOLD} ngày chưa touch)</b>\n\n`;

  for (const c of contacts) {
    const days = daysSince(c.lastTouchedAt);
    const lastDate = c.lastTouchedAt
      ? formatDate(new Date(c.lastTouchedAt))
      : "Chưa bao giờ";
    const pic = c.assignedTo?.name ?? "Unassigned";
    const status = STATUS_LABELS[c.contactStatus] ?? c.contactStatus;

    msg += `❄️ <b>${c.company.name}</b> — ${c.fullName}\n`;
    msg += `   ${days === 999 ? "Chưa liên hệ bao giờ" : `${days} ngày`} | ${status} | ${pic} | ${lastDate}\n\n`;
  }

  msg += `<i>Gửi <code>[Tên công ty] note</code> để cập nhật.</i>`;

  await ctx.reply(msg, { parse_mode: "HTML" });
}
