import type { Bot, Context } from "grammy";
import { prisma } from "@xperise/database";
import {
  COLD_DAYS_THRESHOLD,
  STATUS_LABELS,
  daysSince,
  formatDate,
} from "../lib/formatter.js";
import { getActiveGroupChatId } from "../lib/active-group.js";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

export async function sendColdLeadDigest(bot: Bot<Context>) {
  const groupChatId = await getActiveGroupChatId();
  if (!groupChatId) {
    console.warn("No active Telegram group configured — skipping cold lead digest.");
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
    await bot.api.sendMessage(groupChatId, msg, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Failed to send cold lead digest:", err);
  }

  // AI-enhanced analysis via TRACKER agent
  if (INTERNAL_API_KEY) {
    try {
      const res = await fetch(`${API_URL}/ai-agents/tracker/cold-internal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY,
        },
      });

      if (res.ok) {
        const data = (await res.json()) as { agentRunId: string; leadsAnalyzed: number };
        if (data.leadsAnalyzed > 0) {
          // The tracker agent sends analysis to the Telegram group via sendTelegramMessage
          // We also fetch the analysis from the agent action to send a consolidated message
          const action = await prisma.agentAction.findFirst({
            where: { agentRunId: data.agentRunId, actionType: "analyze_cold_leads" },
            select: { result: true },
          });
          const analysis = (action?.result as { analysis?: string })?.analysis;
          if (analysis) {
            await bot.api.sendMessage(
              groupChatId,
              `🤖 <b>AI Coach — Đề xuất action:</b>\n\n${analysis}`,
              { parse_mode: "HTML" }
            );
          }
        }
      }
    } catch (err) {
      console.error("[cold-lead-cron] TRACKER AI analysis failed:", err);
    }
  }
}
