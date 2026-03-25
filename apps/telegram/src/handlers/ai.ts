import type { Context } from "grammy";
import { prisma } from "@xperise/database";
import { rp } from "../lib/rp.js";
import { generateWithFallback } from "../lib/gemini-provider";
import { sanitizeAiHtml } from "../lib/formatter.js";

const SYSTEM_PROMPT = `You are Xperise AI Sales Assistant — a BD intelligence agent for a consulting firm in Vietnam.
You have access to CRM data (contacts, companies, pipelines, campaigns, actions) provided as context.
Answer questions about the pipeline, leads, sales performance, and suggest next actions.
Reply in the same language the user uses (Vietnamese or English). Keep answers concise for Telegram (max 4000 chars).
Use HTML formatting: <b>bold</b>, <i>italic</i>, <code>code</code>. Do NOT use Markdown.`;

export async function handleAi(ctx: Context) {
  const question = (ctx.match as string)?.trim();
  if (!question) {
    await ctx.reply(
      "Vui long dat cau hoi:\n<code>/ai Pipeline Q1 status?</code>\n<code>/ai Lead nao can cham soc?</code>",
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  // Check binding
  const telegramId = String(ctx.from?.id);
  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  if (!binding) {
    await ctx.reply("Ban chua link tai khoan. Dung /start de xem huong dan.", { ...rp(ctx) });
    return;
  }

  // Send typing indicator
  await ctx.replyWithChatAction("typing");

  try {
    // Gather CRM context based on question keywords
    const context = await gatherContext(question, binding.user.role, binding.user.id);

    const text = await generateWithFallback({
      system: SYSTEM_PROMPT,
      prompt: `CRM DATA CONTEXT:\n${context}\n\nUSER (${binding.user.name}, role: ${binding.user.role}):\n${question}`,
      maxOutputTokens: 1500,
    });

    // Telegram has 4096 char limit
    const reply = sanitizeAiHtml(text);
    await ctx.reply(reply, { ...rp(ctx), parse_mode: "HTML" });
  } catch (err) {
    console.error("[/ai] Error:", err);
    await ctx.reply("Xin loi, co loi xay ra khi xu ly cau hoi. Vui long thu lai.", { ...rp(ctx) });
  }
}

async function gatherContext(question: string, role: string, userId: string): Promise<string> {
  const lowerQ = question.toLowerCase();
  const parts: string[] = [];

  // Always include high-level stats
  const [totalContacts, totalCompanies, contactsByStatus] = await Promise.all([
    prisma.contact.count(),
    prisma.company.count(),
    prisma.contact.groupBy({ by: ["contactStatus"], _count: true }),
  ]);

  parts.push(`OVERVIEW: ${totalContacts} contacts, ${totalCompanies} companies`);
  parts.push(`STATUS BREAKDOWN: ${contactsByStatus.map((s) => `${s.contactStatus}: ${s._count}`).join(", ")}`);

  // Pipeline data
  if (lowerQ.includes("pipeline") || lowerQ.includes("deal") || lowerQ.includes("revenue") || lowerQ.includes("target")) {
    const pipelines = await prisma.pipeline.findMany({
      include: { company: { select: { name: true } }, pic: { select: { name: true } } },
      orderBy: { totalRevenue: "desc" },
      take: 20,
    });
    if (pipelines.length > 0) {
      parts.push(`\nPIPELINE (${pipelines.length} deals):`);
      for (const p of pipelines) {
        parts.push(`- ${p.company.name}: ${p.dealStage} | ${Number(p.totalRevenue).toLocaleString()}d | ${p.probability}% | ${p.pic?.name ?? "Unassigned"}`);
      }
    }
  }

  // Cold leads
  if (lowerQ.includes("cold") || lowerQ.includes("nguoi") || lowerQ.includes("cham soc") || lowerQ.includes("inactive") || lowerQ.includes("follow")) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const coldLeads = await prisma.contact.findMany({
      where: {
        contactStatus: { notIn: ["CONVERTED", "NO_CONTACT", "LOST"] },
        OR: [
          { lastTouchedAt: { lt: sevenDaysAgo } },
          { lastTouchedAt: null },
        ],
      },
      include: { company: { select: { name: true } }, assignedTo: { select: { name: true } } },
      orderBy: { lastTouchedAt: "asc" },
      take: 15,
    });
    if (coldLeads.length > 0) {
      parts.push(`\nCOLD LEADS (no activity > 7 days, ${coldLeads.length} total):`);
      for (const c of coldLeads) {
        const days = c.lastTouchedAt
          ? Math.floor((Date.now() - c.lastTouchedAt.getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        parts.push(`- ${c.fullName} (${c.company?.name ?? "N/A"}) | ${c.contactStatus} | ${days}d idle | ${c.assignedTo?.name ?? "Unassigned"}`);
      }
    }
  }

  // Campaign/outreach data
  if (lowerQ.includes("campaign") || lowerQ.includes("email") || lowerQ.includes("outreach") || lowerQ.includes("sequence")) {
    const campaigns = await prisma.campaign.findMany({
      include: {
        _count: { select: { recipients: true, emailLogs: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    if (campaigns.length > 0) {
      parts.push(`\nCAMPAIGNS (${campaigns.length}):`);
      for (const c of campaigns) {
        parts.push(`- ${c.name}: ${c.status} | ${c._count.recipients} recipients | ${c._count.emailLogs} emails`);
      }
    }

    const emailStats = await prisma.emailLog.aggregate({
      _count: { id: true },
      where: { campaignId: { not: null } },
    });
    const opened = await prisma.emailLog.count({ where: { openedAt: { not: null } } });
    const replied = await prisma.emailLog.count({ where: { repliedAt: { not: null } } });
    parts.push(`\nEMAIL STATS: ${emailStats._count.id} sent, ${opened} opened, ${replied} replied`);
  }

  // Recent actions
  if (lowerQ.includes("recent") || lowerQ.includes("activity") || lowerQ.includes("tuan") || lowerQ.includes("week") || lowerQ.includes("hom nay") || lowerQ.includes("today")) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentActions = await prisma.contactAction.findMany({
      where: { performedAt: { gte: since } },
      include: {
        contact: { select: { fullName: true } },
        performedBy: { select: { name: true } },
      },
      orderBy: { performedAt: "desc" },
      take: 15,
    });
    if (recentActions.length > 0) {
      parts.push(`\nRECENT ACTIONS (last 7 days, ${recentActions.length}):`);
      for (const a of recentActions) {
        const date = a.performedAt.toISOString().split("T")[0];
        parts.push(`- ${date} ${a.type}: ${a.contact.fullName} by ${a.performedBy.name}${a.note ? ` — ${a.note.substring(0, 50)}` : ""}`);
      }
    }
  }

  // Per-person stats if asking about team
  if (lowerQ.includes("team") || lowerQ.includes("ai") || lowerQ.includes("staff") || lowerQ.includes("performance") || lowerQ.includes("hieu suat")) {
    const byPerson = await prisma.contact.groupBy({
      by: ["assignedToId"],
      _count: true,
      where: { assignedToId: { not: null } },
    });
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    parts.push(`\nTEAM:`);
    for (const bp of byPerson) {
      const user = userMap[bp.assignedToId ?? ""];
      if (user) parts.push(`- ${user.name} (${user.role}): ${bp._count} contacts`);
    }
  }

  // If nothing specific matched, add a general snapshot
  if (parts.length <= 2) {
    const recentActions = await prisma.contactAction.findMany({
      include: { contact: { select: { fullName: true } }, performedBy: { select: { name: true } } },
      orderBy: { performedAt: "desc" },
      take: 10,
    });
    parts.push(`\nRECENT ACTIONS:`);
    for (const a of recentActions) {
      parts.push(`- ${a.type}: ${a.contact.fullName} by ${a.performedBy.name}`);
    }
  }

  return parts.join("\n");
}
