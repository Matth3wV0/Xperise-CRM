import { generateText } from "ai";
import { prisma } from "@xperise/database";
import {
  searchPeople,
  type ApolloPersonResult,
  type ApolloSearchFilters,
} from "../apollo/apollo.service.js";
import { sendTelegramMessage } from "../../common/telegram-notify.js";
import { getModel } from "./gemini-provider.js";

// ── Xperise ICP definition ──────────────────────────────────────────────────

const ICP_PROMPT = `You are an AI sales analyst for Xperise, a B2B consulting firm in Vietnam specializing in:
- Organization restructuring & management consulting
- HR transformation & executive recruitment
- Digital transformation advisory
- Training & leadership development

Our Ideal Customer Profile (ICP):
- Industries: Banking/Finance, FMCG, Manufacturing, Pharma, Media, Tech, Conglomerates
- Company size: 200+ employees
- Location: Vietnam (primary), Southeast Asia
- Decision makers: C-level (CEO, CFO, CHRO, COO), VP/Director of HR, VP/Director of Operations
- Pain signals: rapid growth, M&A activity, new market entry, digital transformation initiatives, leadership gaps

Score each lead 1-5:
5 = Perfect fit (right industry, right title, right size, in Vietnam)
4 = Strong fit (3 of 4 criteria match)
3 = Moderate fit (2 of 4 criteria match)
2 = Weak fit (1 criterion matches)
1 = No fit`;

// ── Types ────────────────────────────────────────────────────────────────────

interface HunterInput {
  personTitles?: string[];
  organizationIndustries?: string[];
  personLocations?: string[];
  employeeRanges?: string[];
  maxResults?: number;
  triggeredById?: string;
  trigger?: string;
}

interface ScoredLead {
  person: ApolloPersonResult;
  fitScore: number;
  fitReason: string;
}

// ── Main Agent Function ──────────────────────────────────────────────────────

export async function runHunterAgent(input: HunterInput): Promise<{
  agentRunId: string;
  newLeads: ScoredLead[];
  duplicates: number;
  totalFound: number;
}> {
  // 1. Create AgentRun record
  const agentRun = await prisma.agentRun.create({
    data: {
      agentType: "HUNTER",
      trigger: input.trigger ?? "manual",
      triggeredById: input.triggeredById,
      inputSummary: JSON.stringify({
        titles: input.personTitles,
        industries: input.organizationIndustries,
        locations: input.personLocations,
      }),
    },
  });

  try {
    // 2. Search Apollo
    const filters: ApolloSearchFilters = {
      personTitles: input.personTitles,
      organizationIndustries: input.organizationIndustries,
      personLocations: input.personLocations ?? ["Vietnam"],
      employeeRanges: input.employeeRanges,
      perPage: input.maxResults ?? 25,
    };

    const searchResult = await searchPeople(filters);
    const totalFound = searchResult.pagination.total_entries;
    const people = searchResult.people;

    if (people.length === 0) {
      await finishRun(agentRun.id, "COMPLETED", 0, `No results found for given criteria. Total in Apollo: ${totalFound}`);
      return { agentRunId: agentRun.id, newLeads: [], duplicates: 0, totalFound };
    }

    // 3. Deduplicate against existing contacts
    const emails = people.map((p) => p.email).filter(Boolean) as string[];
    const names = people.map((p) => p.name);

    const existingByEmail = await prisma.contact.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });
    const existingEmails = new Set(existingByEmail.map((c) => c.email?.toLowerCase()));

    const existingByName = await prisma.contact.findMany({
      where: { fullName: { in: names } },
      select: { fullName: true },
    });
    const existingNames = new Set(existingByName.map((c) => c.fullName.toLowerCase()));

    const newPeople: ApolloPersonResult[] = [];
    let duplicates = 0;

    for (const person of people) {
      const emailMatch = person.email && existingEmails.has(person.email.toLowerCase());
      const nameMatch = existingNames.has(person.name.toLowerCase());
      if (emailMatch || nameMatch) {
        duplicates++;
      } else {
        newPeople.push(person);
      }
    }

    if (newPeople.length === 0) {
      await finishRun(agentRun.id, "COMPLETED", 0, `Found ${totalFound} people, but all ${duplicates} are already in CRM.`);
      await sendTelegramMessage(
        `<b>HUNTER Agent</b>\n\nSearch: ${formatCriteria(input)}\nFound: ${totalFound} | Already in CRM: ${duplicates} | New: 0\n\n<i>No new leads to evaluate.</i>`
      );
      return { agentRunId: agentRun.id, newLeads: [], duplicates, totalFound };
    }

    // 4. AI fit evaluation (batch — up to 15 at a time)
    const leadsToEvaluate = newPeople.slice(0, 15);
    const scoredLeads = await evaluateFitScores(leadsToEvaluate);

    // Sort by score desc
    scoredLeads.sort((a, b) => b.fitScore - a.fitScore);

    // 5. Log agent actions for each scored lead
    for (const lead of scoredLeads) {
      await prisma.agentAction.create({
        data: {
          agentRunId: agentRun.id,
          actionType: "evaluate_lead",
          status: "EXECUTED",
          targetEntity: "contact",
          payload: {
            apolloId: lead.person.id,
            name: lead.person.name,
            title: lead.person.title,
            email: lead.person.email,
            company: lead.person.organization?.name,
            fitScore: lead.fitScore,
            fitReason: lead.fitReason,
          },
          executedAt: new Date(),
        },
      });
    }

    // 6. Create "save_leads" action as PENDING_APPROVAL for high-fit leads
    const highFit = scoredLeads.filter((l) => l.fitScore >= 4);
    if (highFit.length > 0) {
      await prisma.agentAction.create({
        data: {
          agentRunId: agentRun.id,
          actionType: "save_leads",
          status: "PENDING_APPROVAL",
          payload: {
            leads: highFit.map((l) => ({
              apolloId: l.person.id,
              name: l.person.name,
              title: l.person.title,
              email: l.person.email,
              company: l.person.organization?.name,
              industry: l.person.organization?.industry,
              fitScore: l.fitScore,
            })),
            count: highFit.length,
          },
        },
      });
    }

    // 7. Report to Telegram
    const highCount = scoredLeads.filter((l) => l.fitScore >= 4).length;
    const medCount = scoredLeads.filter((l) => l.fitScore === 3).length;
    const lowCount = scoredLeads.filter((l) => l.fitScore <= 2).length;

    let msg = `<b>HUNTER Agent</b>\n\n`;
    msg += `Search: ${formatCriteria(input)}\n`;
    msg += `Found: ${totalFound} | Duplicates: ${duplicates} | New: ${newPeople.length}\n`;
    msg += `Evaluated: ${scoredLeads.length} leads\n\n`;
    msg += `<b>Fit Scores:</b>\n`;
    msg += `  High (4-5): ${highCount}\n`;
    msg += `  Medium (3): ${medCount}\n`;
    msg += `  Low (1-2): ${lowCount}\n\n`;

    // Show top 5
    const top5 = scoredLeads.slice(0, 5);
    msg += `<b>Top leads:</b>\n`;
    for (const lead of top5) {
      const stars = "★".repeat(lead.fitScore) + "☆".repeat(5 - lead.fitScore);
      msg += `${stars} <b>${lead.person.name}</b>\n`;
      msg += `  ${lead.person.title ?? "N/A"} @ ${lead.person.organization?.name ?? "N/A"}\n`;
      msg += `  ${lead.fitReason}\n\n`;
    }

    if (highFit.length > 0) {
      msg += `\nImport ${highFit.length} high-fit leads vao CRM?`;

      await sendTelegramMessage(msg, {
        inlineKeyboard: [
          [
            { text: `Import ${highFit.length} leads`, callback_data: `hi:${agentRun.id}` },
            { text: "Skip", callback_data: `hs:${agentRun.id}` },
          ],
        ],
      });
    } else {
      msg += `\n<i>No high-fit leads found. Consider broadening criteria.</i>`;
      await sendTelegramMessage(msg);
    }

    // 8. Finish run
    const tokenEstimate = scoredLeads.length * 500; // rough estimate
    await finishRun(
      agentRun.id,
      "COMPLETED",
      tokenEstimate,
      `Found ${totalFound}, ${duplicates} dupes, evaluated ${scoredLeads.length}: ${highCount} high, ${medCount} med, ${lowCount} low`
    );

    return { agentRunId: agentRun.id, newLeads: scoredLeads, duplicates, totalFound };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await finishRun(agentRun.id, "FAILED", 0, undefined, errorMsg);
    throw error;
  }
}

// ── Import approved leads into CRM ───────────────────────────────────────────

export async function importHunterLeads(agentRunId: string, approvedById?: string): Promise<number> {
  const action = await prisma.agentAction.findFirst({
    where: {
      agentRunId,
      actionType: "save_leads",
      status: "PENDING_APPROVAL",
    },
  });

  if (!action) return 0;

  const payload = action.payload as { leads: Array<{
    apolloId: string;
    name: string;
    title: string;
    email: string | null;
    company: string | null;
    industry: string | null;
    fitScore: number;
  }>};

  let imported = 0;

  for (const lead of payload.leads) {
    // Find or create company
    let companyId: string | undefined;
    if (lead.company) {
      const existing = await prisma.company.findFirst({
        where: { name: { equals: lead.company, mode: "insensitive" } },
      });
      if (existing) {
        companyId = existing.id;
      } else {
        const newCompany = await prisma.company.create({
          data: {
            name: lead.company,
            industry: mapIndustry(lead.industry),
          },
        });
        companyId = newCompany.id;
      }
    }

    // Check for duplicate contact
    const existingContact = await prisma.contact.findFirst({
      where: {
        OR: [
          ...(lead.email ? [{ email: lead.email }] : []),
          { fullName: lead.name },
        ],
      },
    });

    if (existingContact) continue;

    // Create contact
    const [firstName, ...rest] = lead.name.split(" ");
    await prisma.contact.create({
      data: {
        fullName: lead.name,
        email: lead.email,
        position: lead.title,
        companyId: companyId ?? "",
        source: "APOLLO",
        contactStatus: "NO_CONTACT",
        apolloContactId: lead.apolloId,
        enrichmentData: { fitScore: lead.fitScore, source: "hunter_agent" },
      },
    });
    imported++;
  }

  // Update action status
  await prisma.agentAction.update({
    where: { id: action.id },
    data: {
      status: "EXECUTED",
      approvedById,
      executedAt: new Date(),
      result: { imported },
    },
  });

  return imported;
}

// ── AI Fit Evaluation ────────────────────────────────────────────────────────

async function evaluateFitScores(people: ApolloPersonResult[]): Promise<ScoredLead[]> {
  const leadsText = people
    .map(
      (p, i) =>
        `Lead ${i + 1}: ${p.name}, ${p.title ?? "N/A"}, ${p.organization?.name ?? "N/A"}, Industry: ${p.organization?.industry ?? "N/A"}, Size: ${p.organization?.estimated_num_employees ?? "N/A"}, Country: ${p.organization?.country ?? "N/A"}`
    )
    .join("\n");

  const { text } = await generateText({
    model: getModel(),
    system: ICP_PROMPT,
    prompt: `Evaluate these leads for Xperise ICP fit. For each lead, respond with exactly one line in format:
Lead N: SCORE | REASON (max 15 words)

${leadsText}`,
    maxOutputTokens: 1500,
  });

  // Parse response
  const scored: ScoredLead[] = [];
  const lines = text.trim().split("\n");

  for (const line of lines) {
    const match = line.match(/Lead\s+(\d+):\s*(\d)\s*\|\s*(.+)/);
    if (!match) continue;

    const index = parseInt(match[1]) - 1;
    const score = parseInt(match[2]);
    const reason = match[3].trim();

    if (index >= 0 && index < people.length && score >= 1 && score <= 5) {
      scored.push({
        person: people[index],
        fitScore: score,
        fitReason: reason,
      });
    }
  }

  return scored;
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
    data: {
      status,
      endedAt: new Date(),
      tokensUsed,
      outputSummary,
      error,
    },
  });
}

function formatCriteria(input: HunterInput): string {
  const parts: string[] = [];
  if (input.personTitles?.length) parts.push(`Titles: ${input.personTitles.join(", ")}`);
  if (input.organizationIndustries?.length) parts.push(`Industries: ${input.organizationIndustries.join(", ")}`);
  if (input.personLocations?.length) parts.push(`Locations: ${input.personLocations.join(", ")}`);
  return parts.join(" | ") || "Default ICP search";
}

function mapIndustry(apolloIndustry: string | null | undefined): import("@xperise/database").Industry {
  if (!apolloIndustry) return "OTHERS";
  const lower = apolloIndustry.toLowerCase();
  if (lower.includes("bank") || lower.includes("financ")) return "BANK";
  if (lower.includes("fmcg") || lower.includes("consumer")) return "FMCG";
  if (lower.includes("manufactur")) return "MANUFACTURING";
  if (lower.includes("pharma") || lower.includes("health")) return "PHARMA_HEALTHCARE";
  if (lower.includes("media") || lower.includes("entertain")) return "MEDIA";
  if (lower.includes("tech") || lower.includes("software") || lower.includes("it")) return "TECH_DURABLE";
  if (lower.includes("conglomerate") || lower.includes("diversif")) return "CONGLOMERATE";
  return "OTHERS";
}
