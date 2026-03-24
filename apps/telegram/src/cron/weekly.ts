import type { Bot, Context } from "grammy";
import { prisma } from "@xperise/database";
import { VERY_COLD_DAYS } from "../lib/formatter.js";
import { getActiveGroupChatId } from "../lib/active-group.js";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

export async function sendWeeklySummary(bot: Bot<Context>) {
  const groupChatId = await getActiveGroupChatId();
  if (!groupChatId) {
    console.warn("No active Telegram group configured — skipping weekly summary.");
    return;
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const coldThreshold = new Date();
  coldThreshold.setDate(coldThreshold.getDate() - VERY_COLD_DAYS);

  const [actions, coldCount] = await Promise.all([
    prisma.contactAction.findMany({
      where: { performedAt: { gte: weekAgo } },
      include: {
        contact: {
          select: {
            fullName: true,
            company: { select: { name: true } },
          },
        },
        performedBy: { select: { name: true } },
      },
      orderBy: { performedAt: "desc" },
    }),
    prisma.contact.count({
      where: {
        contactStatus: { notIn: ["CONVERTED", "NO_CONTACT", "LOST"] as any[] },
        OR: [
          { lastTouchedAt: { lt: coldThreshold } },
          { lastTouchedAt: null },
        ],
      },
    }),
  ]);

  // Group by company
  const byCompany: Record<string, { count: number; types: Set<string> }> = {};
  for (const a of actions) {
    const name = a.contact.company.name;
    (byCompany[name] ??= { count: 0, types: new Set() }).count++;
    byCompany[name].types.add(a.type);
  }

  // By person
  const byPerson: Record<string, number> = {};
  for (const a of actions) {
    const name = a.performedBy.name;
    byPerson[name] = (byPerson[name] ?? 0) + 1;
  }

  const meetings = actions.filter((a) => a.type === "MEETING").length;
  const statusChanges = actions.filter((a) => a.type === "STATUS_CHANGE").length;
  const uniqueCompanies = Object.keys(byCompany).length;

  const weekStr = `${weekAgo.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} - ${now.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`;

  let msg = `📊 <b>Weekly BD Summary</b>\n<i>${weekStr}</i>\n\n`;

  msg += `📈 <b>Tổng kết tuần:</b>\n`;
  msg += `• ${actions.length} actions thực hiện\n`;
  msg += `• ${uniqueCompanies} công ty được tiếp cận\n`;
  if (meetings > 0) msg += `• ${meetings} meetings\n`;
  if (statusChanges > 0) msg += `• ${statusChanges} status thay đổi\n`;

  if (Object.keys(byPerson).length > 0) {
    msg += `\n👥 <b>Theo người:</b>\n`;
    for (const [name, count] of Object.entries(byPerson).sort((a, b) => b[1] - a[1])) {
      msg += `• ${name}: ${count} actions\n`;
    }
  }

  if (uniqueCompanies > 0) {
    msg += `\n🏢 <b>Công ty active (top 8):</b>\n`;
    const sorted = Object.entries(byCompany)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8);
    for (const [company, data] of sorted) {
      msg += `• <b>${company}</b>: ${data.count} actions\n`;
    }
  }

  if (coldCount > 0) {
    msg += `\n🥶 <b>Cần attention:</b> ${coldCount} leads nguội > ${VERY_COLD_DAYS} ngày\n`;
    msg += `Dùng /cold để xem chi tiết.\n`;
  } else {
    msg += `\n✅ Không có leads nguội > ${VERY_COLD_DAYS} ngày. Team đang làm tốt!`;
  }

  try {
    await bot.api.sendMessage(groupChatId, msg, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Failed to send weekly summary:", err);
  }

  // AI-enhanced weekly insights via TRACKER agent
  if (INTERNAL_API_KEY) {
    try {
      const res = await fetch(`${API_URL}/ai-agents/tracker/weekly-internal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY,
        },
      });

      if (res.ok) {
        const data = (await res.json()) as { agentRunId: string };
        const action = await prisma.agentAction.findFirst({
          where: { agentRunId: data.agentRunId, actionType: "weekly_insights" },
          select: { result: true },
        });
        const insights = (action?.result as { insights?: string })?.insights;
        if (insights) {
          await bot.api.sendMessage(
            groupChatId,
            `🤖 <b>AI Strategist — Nhận xét tuần:</b>\n\n${insights}`,
            { parse_mode: "HTML" }
          );
        }
      }
    } catch (err) {
      console.error("[weekly-cron] TRACKER AI insights failed:", err);
    }
  }
}
