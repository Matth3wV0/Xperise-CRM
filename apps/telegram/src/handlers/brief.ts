import type { Context } from "grammy";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@xperise/database";

const MODEL = anthropic("claude-sonnet-4-6");

export async function handleBrief(ctx: Context) {
  const telegramId = String(ctx.from?.id);
  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  if (!binding) {
    await ctx.reply("Ban chua link tai khoan. Dung /start de xem huong dan.");
    return;
  }

  await ctx.replyWithChatAction("typing");

  try {
    const context = await gatherBriefContext(binding.user.id, binding.user.role);

    const { text } = await generateText({
      model: MODEL,
      system: `You are Xperise AI Sales Assistant generating a daily BD briefing for ${binding.user.name} (${binding.user.role}).
Structure:
1. Key metrics snapshot (2-3 lines)
2. Priority follow-ups (top 3-5 contacts that need attention TODAY)
3. Stale deals alert (if any)
4. What was accomplished yesterday
5. Suggested actions for today (2-3 concrete next steps)

Reply in Vietnamese. Use HTML: <b>bold</b>, <i>italic</i>. Keep it under 3000 chars. Be actionable, not generic.`,
      prompt: `CRM DATA:\n${context}\n\nGenerate today's BD briefing.`,
      maxOutputTokens: 1200,
    });

    const reply = text.length > 4000 ? text.substring(0, 3997) + "..." : text;
    await ctx.reply(reply, { parse_mode: "HTML" });
  } catch (err) {
    console.error("[/brief] Error:", err);
    await ctx.reply("Co loi khi tao briefing. Vui long thu lai.");
  }
}

async function gatherBriefContext(userId: string, role: string): Promise<string> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const isStaff = role === "BD_STAFF";

  const contactWhere = isStaff ? { assignedToId: userId } : {};

  const parts: string[] = [];

  // Stats
  const [total, byStatus] = await Promise.all([
    prisma.contact.count({ where: contactWhere }),
    prisma.contact.groupBy({ by: ["contactStatus"], _count: true, where: contactWhere }),
  ]);
  parts.push(`CONTACTS: ${total} total. ${byStatus.map((s) => `${s.contactStatus}: ${s._count}`).join(", ")}`);

  // Yesterday's actions
  const yesterdayActions = await prisma.contactAction.findMany({
    where: {
      performedAt: { gte: yesterday },
      ...(isStaff ? { performedById: userId } : {}),
    },
    include: { contact: { select: { fullName: true } }, performedBy: { select: { name: true } } },
    orderBy: { performedAt: "desc" },
  });
  parts.push(`\nYESTERDAY (${yesterdayActions.length} actions):`);
  for (const a of yesterdayActions.slice(0, 10)) {
    parts.push(`- ${a.type}: ${a.contact.fullName} by ${a.performedBy.name}${a.note ? ` — ${a.note.substring(0, 40)}` : ""}`);
  }

  // Cold leads (need follow-up)
  const coldLeads = await prisma.contact.findMany({
    where: {
      ...contactWhere,
      contactStatus: { notIn: ["CONVERTED", "NO_CONTACT", "LOST"] },
      OR: [{ lastTouchedAt: { lt: sevenDaysAgo } }, { lastTouchedAt: null }],
    },
    include: { company: { select: { name: true } } },
    orderBy: { lastTouchedAt: "asc" },
    take: 10,
  });
  parts.push(`\nCOLD LEADS (${coldLeads.length} idle > 7d):`);
  for (const c of coldLeads) {
    const days = c.lastTouchedAt
      ? Math.floor((now.getTime() - c.lastTouchedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    parts.push(`- ${c.fullName} @ ${c.company?.name ?? "N/A"} | ${c.contactStatus} | ${days}d`);
  }

  // Pipeline
  const pipelines = await prisma.pipeline.findMany({
    where: isStaff ? { picId: userId } : {},
    include: { company: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  if (pipelines.length > 0) {
    parts.push(`\nPIPELINE (${pipelines.length} deals):`);
    for (const p of pipelines) {
      const staleDays = Math.floor((now.getTime() - p.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
      const staleFlag = staleDays > 14 ? ` [STALE ${staleDays}d]` : "";
      parts.push(`- ${p.company.name}: ${p.dealStage} | ${Number(p.totalRevenue).toLocaleString()}d${staleFlag}`);
    }
  }

  // Active campaigns
  const campaigns = await prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    include: { _count: { select: { recipients: true, emailLogs: true } } },
  });
  if (campaigns.length > 0) {
    parts.push(`\nACTIVE CAMPAIGNS:`);
    for (const c of campaigns) {
      parts.push(`- ${c.name}: ${c._count.recipients} recipients, ${c._count.emailLogs} emails sent`);
    }
  }

  parts.push(`\nDATE: ${now.toLocaleDateString("vi-VN")} (${now.toLocaleDateString("vi-VN", { weekday: "long" })})`);

  return parts.join("\n");
}
