import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@xperise/database";
import { sendTelegramMessage } from "../../common/telegram-notify.js";

const MODEL = anthropic("claude-sonnet-4-6");

// ── TRACKER system prompts ──────────────────────────────────────────────────

const COLD_LEAD_SYSTEM = `You are an AI sales coach for Xperise, a B2B consulting firm in Vietnam.
You are analyzing cold/stale leads — contacts that haven't been touched recently.

Your job: Prioritize leads and suggest concrete next actions for the BD team.

Rules:
- Write in Vietnamese (informal business tone like a team chat)
- Be specific: mention contact names, companies, and exact suggestions
- Prioritize by: deal value potential → pipeline stage → days since last touch
- Suggest ONE specific action per lead (call, email, LinkedIn, drop)
- For truly dead leads (>30 days, no response after multiple touches), recommend dropping
- Keep it brief: 1-2 sentences per lead
- Output as a numbered list`;

const WEEKLY_SYSTEM = `You are an AI sales strategist for Xperise, a B2B consulting firm in Vietnam.
You are reviewing the team's weekly BD performance.

Your job: Give honest, actionable insights about the team's sales activity.

Rules:
- Write in Vietnamese (informal business tone like a team chat)
- Highlight wins (new meetings, conversions, high activity)
- Flag concerns (low activity, neglected leads, stalled deals)
- Give 2-3 specific recommendations for next week
- Be direct and honest — don't sugarcoat poor performance
- Keep total output under 300 words`;

// ── Cold Lead AI Analysis ───────────────────────────────────────────────────

interface ColdLeadAnalysisResult {
  agentRunId: string;
  analysis: string;
  leadsAnalyzed: number;
}

export async function analyzeLeadsCold(
  triggeredById?: string
): Promise<ColdLeadAnalysisResult> {
  const agentRun = await prisma.agentRun.create({
    data: {
      agentType: "TRACKER",
      trigger: "cron:cold-lead",
      triggeredById,
      inputSummary: "Cold lead analysis",
    },
  });

  try {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 7);

    const coldContacts = await prisma.contact.findMany({
      where: {
        contactStatus: { notIn: ["CONVERTED", "NO_CONTACT"] as any[] },
        OR: [
          { lastTouchedAt: { lt: thresholdDate } },
          { lastTouchedAt: null },
        ],
      },
      include: {
        company: { select: { name: true, industry: true } },
        assignedTo: { select: { name: true } },
        actions: {
          orderBy: { performedAt: "desc" },
          take: 3,
          select: { type: true, note: true, performedAt: true },
        },
        emailLogs: {
          orderBy: { sentAt: "desc" },
          take: 2,
          select: { subject: true, sentAt: true, openedAt: true, repliedAt: true },
        },
      },
      orderBy: { lastTouchedAt: "asc" },
      take: 15,
    });

    if (coldContacts.length === 0) {
      await finishRun(agentRun.id, "COMPLETED", 0, "No cold leads found");
      return { agentRunId: agentRun.id, analysis: "", leadsAnalyzed: 0 };
    }

    // Build context for AI
    let context = `COLD LEADS (nguoi > 7 ngay chua touch):\n\n`;
    for (const c of coldContacts) {
      const days = c.lastTouchedAt
        ? Math.floor((Date.now() - new Date(c.lastTouchedAt).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      context += `- ${c.fullName} (${c.position ?? "N/A"}) @ ${c.company.name} [${c.company.industry ?? "Unknown"}]\n`;
      context += `  PIC: ${c.assignedTo?.name ?? "Chua assign"} | Status: ${c.contactStatus} | ${days === 999 ? "Chua bao gio touch" : `${days} ngay`}\n`;

      if (c.actions.length > 0) {
        context += `  Recent: ${c.actions.map((a) => `${a.type}(${a.performedAt.toISOString().split("T")[0]})`).join(", ")}\n`;
      }
      if (c.emailLogs.length > 0) {
        for (const e of c.emailLogs) {
          context += `  Email: "${e.subject}" (${e.sentAt.toISOString().split("T")[0]})`;
          if (e.openedAt) context += ` [OPENED]`;
          if (e.repliedAt) context += ` [REPLIED]`;
          context += `\n`;
        }
      }
      context += `\n`;
    }

    const { text, usage } = await generateText({
      model: MODEL,
      system: COLD_LEAD_SYSTEM,
      prompt: `Phân tích ${coldContacts.length} cold leads sau và đề xuất action cụ thể cho team:\n\n${context}`,
      maxOutputTokens: 600,
    });

    // Store analysis as agent action
    await prisma.agentAction.create({
      data: {
        agentRunId: agentRun.id,
        actionType: "analyze_cold_leads",
        status: "EXECUTED",
        targetEntity: "contact",
        payload: { leadsAnalyzed: coldContacts.length },
        result: { analysis: text },
        executedAt: new Date(),
      },
    });

    const tokensUsed = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    await finishRun(agentRun.id, "COMPLETED", tokensUsed, `Analyzed ${coldContacts.length} cold leads`);

    return { agentRunId: agentRun.id, analysis: text, leadsAnalyzed: coldContacts.length };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await finishRun(agentRun.id, "FAILED", 0, undefined, errorMsg);
    throw error;
  }
}

// ── Weekly AI Insights ──────────────────────────────────────────────────────

interface WeeklyInsightsResult {
  agentRunId: string;
  insights: string;
}

export async function generateWeeklyInsights(
  triggeredById?: string
): Promise<WeeklyInsightsResult> {
  const agentRun = await prisma.agentRun.create({
    data: {
      agentType: "TRACKER",
      trigger: "cron:weekly",
      triggeredById,
      inputSummary: "Weekly performance insights",
    },
  });

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [actions, pipelineStats, newContacts, conversions] = await Promise.all([
      prisma.contactAction.findMany({
        where: { performedAt: { gte: weekAgo } },
        include: {
          contact: {
            select: { fullName: true, company: { select: { name: true } } },
          },
          performedBy: { select: { name: true } },
        },
        orderBy: { performedAt: "desc" },
      }),
      prisma.pipeline.groupBy({
        by: ["dealStage"],
        _count: true,
        _sum: { totalRevenue: true },
      }),
      prisma.contact.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.contact.count({
        where: {
          contactStatus: "CONVERTED" as any,
          lastTouchedAt: { gte: weekAgo },
        },
      }),
    ]);

    // Build context
    let context = `WEEKLY STATS (${weekAgo.toISOString().split("T")[0]} → ${now.toISOString().split("T")[0]}):\n\n`;
    context += `Total actions: ${actions.length}\n`;
    context += `New contacts added: ${newContacts}\n`;
    context += `Conversions this week: ${conversions}\n\n`;

    // By person
    const byPerson: Record<string, { total: number; types: Record<string, number> }> = {};
    for (const a of actions) {
      const name = a.performedBy.name;
      byPerson[name] ??= { total: 0, types: {} };
      byPerson[name].total++;
      byPerson[name].types[a.type] = (byPerson[name].types[a.type] ?? 0) + 1;
    }

    context += `BY TEAM MEMBER:\n`;
    for (const [name, data] of Object.entries(byPerson).sort(([, a], [, b]) => b.total - a.total)) {
      context += `- ${name}: ${data.total} actions (${Object.entries(data.types).map(([t, c]) => `${t}:${c}`).join(", ")})\n`;
    }

    // Pipeline
    if (pipelineStats.length > 0) {
      context += `\nPIPELINE:\n`;
      for (const s of pipelineStats) {
        context += `- ${s.dealStage}: ${s._count} deals, total value ${s._sum.totalRevenue ?? 0}\n`;
      }
    }

    // Notable actions (meetings, conversions)
    const notableActions = actions.filter((a) =>
      ["MEETING", "STATUS_CHANGE"].includes(a.type)
    );
    if (notableActions.length > 0) {
      context += `\nNOTABLE ACTIONS:\n`;
      for (const a of notableActions.slice(0, 10)) {
        context += `- ${a.performedBy.name}: ${a.type} — ${a.contact.company.name}/${a.contact.fullName} — ${a.note ?? "no note"}\n`;
      }
    }

    const { text, usage } = await generateText({
      model: MODEL,
      system: WEEKLY_SYSTEM,
      prompt: `Đây là dữ liệu BD tuần này. Hãy phân tích và đưa ra nhận xét + đề xuất cho team:\n\n${context}`,
      maxOutputTokens: 500,
    });

    await prisma.agentAction.create({
      data: {
        agentRunId: agentRun.id,
        actionType: "weekly_insights",
        status: "EXECUTED",
        targetEntity: "system",
        payload: { actionsCount: actions.length, newContacts, conversions },
        result: { insights: text },
        executedAt: new Date(),
      },
    });

    const tokensUsed = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    await finishRun(agentRun.id, "COMPLETED", tokensUsed, `Weekly insights: ${actions.length} actions analyzed`);

    return { agentRunId: agentRun.id, insights: text };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await finishRun(agentRun.id, "FAILED", 0, undefined, errorMsg);
    throw error;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function finishRun(
  id: string,
  status: "COMPLETED" | "FAILED",
  tokensUsed: number,
  outputSummary?: string,
  error?: string
) {
  await prisma.agentRun.update({
    where: { id },
    data: { status, endedAt: new Date(), tokensUsed, outputSummary, error },
  });
}
