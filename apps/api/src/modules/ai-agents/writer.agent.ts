import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@xperise/database";
import { sendTelegramMessage } from "../../common/telegram-notify.js";

const MODEL = anthropic("claude-sonnet-4-6");

// ── Xperise context for email drafting ───────────────────────────────────────

const WRITER_SYSTEM = `You are an AI email copywriter for Xperise, a B2B consulting firm in Vietnam.
Xperise specializes in: Organization Restructuring, HR Transformation, Executive Recruitment, Digital Transformation Advisory, Training & Leadership Development.

Your job: Draft cold outreach emails that are professional, personal, and concise.

Rules:
- Write in English (default) or Vietnamese if specified
- First email: 3-5 sentences max. No attachments mention. One clear CTA (15-min call, coffee chat)
- Follow-up: Even shorter (2-3 sentences). Reference previous email. Add new value angle
- Personalization is KEY: mention the contact's name, title, company, and a relevant pain point for their industry
- Tone: Confident but not pushy. Consultant-peer level, not salesperson
- Subject line: Short, specific, no spam triggers. Include company name or industry insight
- Sign off as the BD team member (will be replaced with actual name)
- Do NOT use generic phrases like "I hope this email finds you well"
- Do NOT include [brackets] or placeholder text — fill everything in

Output format (strict):
SUBJECT: <subject line>
---
<email body>`;

// ── Industry pain points for personalization ─────────────────────────────────

const INDUSTRY_ANGLES: Record<string, string> = {
  BANKING_FINANCE: "regulatory compliance pressure, digital banking transformation, talent retention in fintech era, operational cost optimization",
  FMCG: "digital commerce operations, supply chain talent gaps, rapid market expansion challenges, retail execution optimization",
  MANUFACTURING: "Industry 4.0 transition, skilled labor shortage, operational excellence, lean transformation needs",
  PHARMA_HEALTHCARE: "regulatory talent needs, R&D organization scaling, market access strategy, digital health transformation",
  MEDIA_ENTERTAINMENT: "content operation scaling, digital platform talent, audience analytics capability gaps, monetization strategy",
  TECH: "hyper-growth scaling challenges, engineering leadership gaps, organizational design for scale, culture during rapid hiring",
  CONGLOMERATE: "multi-business unit alignment, shared services optimization, succession planning, group-level transformation",
  OTHERS: "organizational growth challenges, leadership development needs, operational efficiency gaps",
};

// ── Types ────────────────────────────────────────────────────────────────────

interface WriterInput {
  contactId: string;
  emailType?: "initial" | "follow_up";
  angle?: string; // custom angle/focus
  language?: "en" | "vi";
  triggeredById?: string;
  trigger?: string;
}

interface DraftResult {
  agentRunId: string;
  subject: string;
  body: string;
  contactName: string;
  companyName: string;
}

// ── Main Agent Function ──────────────────────────────────────────────────────

export async function runWriterAgent(input: WriterInput): Promise<DraftResult> {
  const agentRun = await prisma.agentRun.create({
    data: {
      agentType: "WRITER",
      trigger: input.trigger ?? "manual",
      triggeredById: input.triggeredById,
      inputSummary: JSON.stringify({ contactId: input.contactId, emailType: input.emailType }),
    },
  });

  try {
    // 1. Fetch contact + company context
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      include: {
        company: true,
        actions: {
          orderBy: { performedAt: "desc" },
          take: 5,
          include: { performedBy: { select: { name: true } } },
        },
        emailLogs: {
          orderBy: { sentAt: "desc" },
          take: 3,
        },
      },
    });

    if (!contact) {
      await finishRun(agentRun.id, "FAILED", 0, undefined, "Contact not found");
      throw new Error(`Contact ${input.contactId} not found`);
    }

    // 2. Build context for the AI
    const industryKey = contact.company.industry ?? "OTHERS";
    const painPoints = INDUSTRY_ANGLES[industryKey] ?? INDUSTRY_ANGLES.OTHERS;
    const emailType = input.emailType ?? (contact.emailLogs.length > 0 ? "follow_up" : "initial");
    const lang = input.language ?? "en";

    let contextBlock = `CONTACT: ${contact.fullName}, ${contact.position ?? "Executive"} at ${contact.company.name}`;
    contextBlock += `\nINDUSTRY: ${contact.company.industry ?? "Unknown"}`;
    contextBlock += `\nCOMPANY SIZE: ${contact.company.size ?? "Unknown"}`;
    if (contact.company.website) contextBlock += `\nWEBSITE: ${contact.company.website}`;
    contextBlock += `\nINDUSTRY PAIN POINTS: ${painPoints}`;
    contextBlock += `\nCONTACT STATUS: ${contact.contactStatus}`;
    contextBlock += `\nEMAIL: ${contact.email ?? "unknown"}`;

    if (contact.actions.length > 0) {
      contextBlock += `\n\nRECENT INTERACTIONS:`;
      for (const a of contact.actions) {
        contextBlock += `\n- ${a.type} (${a.performedAt.toISOString().split("T")[0]}): ${a.note ?? "no note"}`;
      }
    }

    if (contact.emailLogs.length > 0 && emailType === "follow_up") {
      contextBlock += `\n\nPREVIOUS EMAILS:`;
      for (const e of contact.emailLogs) {
        contextBlock += `\n- Subject: "${e.subject}" (${e.sentAt.toISOString().split("T")[0]})`;
        if (e.openedAt) contextBlock += ` [OPENED]`;
        if (e.repliedAt) contextBlock += ` [REPLIED]`;
      }
    }

    if (input.angle) {
      contextBlock += `\n\nCUSTOM ANGLE: ${input.angle}`;
    }

    // 3. Generate email draft
    const prompt = emailType === "initial"
      ? `Draft an initial cold outreach email to this contact.${lang === "vi" ? " Write in Vietnamese." : ""}\n\n${contextBlock}`
      : `Draft a follow-up email to this contact (they haven't replied to previous emails).${lang === "vi" ? " Write in Vietnamese." : ""}\n\n${contextBlock}`;

    const { text, usage } = await generateText({
      model: MODEL,
      system: WRITER_SYSTEM,
      prompt,
      maxOutputTokens: 800,
    });

    // 4. Parse subject and body
    const subjectMatch = text.match(/^SUBJECT:\s*(.+)/m);
    const subject = subjectMatch ? subjectMatch[1].trim() : `Xperise x ${contact.company.name}`;

    const separatorIndex = text.indexOf("---");
    const body = separatorIndex >= 0
      ? text.substring(separatorIndex + 3).trim()
      : text.replace(/^SUBJECT:.*\n*/m, "").trim();

    // 5. Store as PENDING_APPROVAL action
    await prisma.agentAction.create({
      data: {
        agentRunId: agentRun.id,
        actionType: "draft_email",
        status: "PENDING_APPROVAL",
        targetEntity: "contact",
        targetId: contact.id,
        payload: {
          subject,
          body,
          contactName: contact.fullName,
          companyName: contact.company.name,
          email: contact.email,
          emailType,
          language: lang,
        },
      },
    });

    // 6. Notify Telegram
    let msg = `<b>WRITER Agent — Email Draft</b>\n\n`;
    msg += `To: <b>${contact.fullName}</b> (${contact.position ?? "N/A"})\n`;
    msg += `Company: ${contact.company.name}\n`;
    msg += `Type: ${emailType === "initial" ? "Initial outreach" : "Follow-up"}\n\n`;
    msg += `<b>Subject:</b> ${escapeHtml(subject)}\n\n`;
    msg += `<b>Body:</b>\n${escapeHtml(body.substring(0, 800))}${body.length > 800 ? "..." : ""}\n\n`;
    msg += `Gửi email này?`;

    await sendTelegramMessage(msg, {
      inlineKeyboard: [
        [
          { text: "Send", callback_data: `ws:${agentRun.id}` },
          { text: "Edit & Send", callback_data: `we:${agentRun.id}` },
          { text: "Skip", callback_data: `wk:${agentRun.id}` },
        ],
      ],
    });

    // 7. Finish run
    const tokensUsed = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    await finishRun(agentRun.id, "COMPLETED", tokensUsed, `Draft for ${contact.fullName}: "${subject}"`);

    return {
      agentRunId: agentRun.id,
      subject,
      body,
      contactName: contact.fullName,
      companyName: contact.company.name,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await finishRun(agentRun.id, "FAILED", 0, undefined, errorMsg);
    throw error;
  }
}

// ── Batch draft for campaign recipients ──────────────────────────────────────

export async function draftForCampaign(
  campaignId: string,
  options?: { language?: "en" | "vi"; angle?: string; triggeredById?: string }
): Promise<{ drafted: number; skipped: number }> {
  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "APPROVED" },
    include: { contact: { select: { id: true, fullName: true, email: true } } },
    take: 10, // batch limit
  });

  let drafted = 0;
  let skipped = 0;

  for (const r of recipients) {
    if (!r.contact.email) {
      skipped++;
      continue;
    }

    try {
      await runWriterAgent({
        contactId: r.contact.id,
        language: options?.language,
        angle: options?.angle,
        triggeredById: options?.triggeredById,
        trigger: `campaign:${campaignId}`,
      });
      drafted++;
    } catch {
      skipped++;
    }
  }

  return { drafted, skipped };
}

// ── Send approved email draft ────────────────────────────────────────────────

export async function sendApprovedDraft(agentRunId: string, approvedById?: string): Promise<boolean> {
  const action = await prisma.agentAction.findFirst({
    where: { agentRunId, actionType: "draft_email", status: "PENDING_APPROVAL" },
  });

  if (!action) return false;

  const payload = action.payload as {
    subject: string;
    body: string;
    email: string;
    contactName: string;
    companyName: string;
    emailType: string;
  };

  if (!payload.email) return false;

  // Create EmailLog record (actual sending happens via Apollo Sequences or direct SMTP in future)
  await prisma.emailLog.create({
    data: {
      subject: payload.subject,
      body: payload.body,
      status: "SENT",
      contactId: action.targetId!,
      sentAt: new Date(),
      metadata: { source: "writer_agent", agentRunId },
    },
  });

  // Create ContactAction
  await prisma.contactAction.create({
    data: {
      type: "EMAIL_SENT",
      status: "DONE",
      note: `AI-drafted: "${payload.subject}"`,
      contactId: action.targetId!,
      performedById: approvedById ?? "system",
      metadata: { agentRunId, aiDrafted: true },
    },
  });

  // Update contact lastTouchedAt
  await prisma.contact.update({
    where: { id: action.targetId! },
    data: { lastTouchedAt: new Date() },
  });

  // Update action
  await prisma.agentAction.update({
    where: { id: action.id },
    data: { status: "EXECUTED", approvedById, executedAt: new Date(), result: { sent: true } },
  });

  return true;
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
