import type { Bot, Context } from "grammy";
import { prisma } from "@xperise/database";
import {
  COLD_DAYS_THRESHOLD,
  STATUS_LABELS,
  daysSince,
  formatDate,
} from "../lib/formatter.js";

const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;

export async function sendColdLeadDigest(bot: Bot<Context>) {
  if (!GROUP_CHAT_ID) {
    console.warn("TELEGRAM_GROUP_CHAT_ID not set — skipping cold lead digest.");
    return;
  }

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - COLD_DAYS_THRESHOLD);

  const coldContacts = await prisma.contact.findMany({
    where: {
      contactStatus: { notIn: ["CONVERTED", "NO_CONTACT"] as any[] },
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

  if (coldContacts.length === 0) return;

  // Group by PIC
  const byPic: Record<string, typeof coldContacts> = {};
  for (const c of coldContacts) {
    const pic = c.assignedTo?.name ?? "Chưa assign";
    (byPic[pic] ??= []).push(c);
  }

  const today = new Date().toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  let msg = `🥶 <b>Cold Lead Digest — ${today}</b>\n\n`;

  for (const [pic, contacts] of Object.entries(byPic)) {
    msg += `👤 <b>${pic}:</b>\n`;
    for (const c of contacts) {
      const days = daysSince(c.lastTouchedAt);
      const lastDate = c.lastTouchedAt
        ? formatDate(new Date(c.lastTouchedAt))
        : "chưa bao giờ";
      const status = STATUS_LABELS[c.contactStatus] ?? c.contactStatus;
      msg += `  • <b>${c.company.name}</b> — ${c.fullName} (${days === 999 ? "chưa touch" : `${days}d`}, ${status}, last: ${lastDate})\n`;
    }
    msg += "\n";
  }

  msg += `<i>Gửi <code>[Tên công ty] note</code> để cập nhật.</i>`;

  try {
    await bot.api.sendMessage(GROUP_CHAT_ID, msg, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Failed to send cold lead digest:", err);
  }
}
