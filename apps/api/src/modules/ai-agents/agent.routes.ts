import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { authenticate } from "../../common/auth-guard.js";
import { authorize } from "../../common/auth-guard.js";
import { runHunterAgent, importHunterLeads } from "./hunter.agent.js";
import { runWriterAgent, sendApprovedDraft, draftForCampaign } from "./writer.agent.js";
import { analyzeLeadsCold, generateWeeklyInsights } from "./tracker.agent.js";

export async function agentRoutes(server: FastifyInstance) {
  // ── Internal service-to-service endpoint (Telegram bot → API) ──────────────
  // Uses INTERNAL_API_KEY instead of JWT — for cross-process agent triggers
  server.post("/writer/draft-internal", async (request, reply) => {
    const key = request.headers["x-internal-key"];
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected || key !== expected) {
      return reply.status(401).send({ error: "Invalid internal key" });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const contactId = body.contactId as string;
    if (!contactId) return reply.status(400).send({ error: "contactId is required" });

    const result = await runWriterAgent({
      contactId,
      angle: body.angle as string | undefined,
      triggeredById: body.triggeredById as string | undefined,
      trigger: (body.trigger as string) ?? "telegram",
    });

    return {
      agentRunId: result.agentRunId,
      subject: result.subject,
      contactName: result.contactName,
    };
  });

  // POST /ai-agents/tracker/cold-internal — Telegram cron triggers cold lead AI analysis
  server.post("/tracker/cold-internal", async (request, reply) => {
    const key = request.headers["x-internal-key"];
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected || key !== expected) {
      return reply.status(401).send({ error: "Invalid internal key" });
    }

    const result = await analyzeLeadsCold();
    return { agentRunId: result.agentRunId, leadsAnalyzed: result.leadsAnalyzed };
  });

  // POST /ai-agents/tracker/weekly-internal — Telegram cron triggers weekly AI insights
  server.post("/tracker/weekly-internal", async (request, reply) => {
    const key = request.headers["x-internal-key"];
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected || key !== expected) {
      return reply.status(401).send({ error: "Invalid internal key" });
    }

    const result = await generateWeeklyInsights();
    return { agentRunId: result.agentRunId };
  });

  server.addHook("preHandler", authenticate);

  // POST /ai-agents/hunter/run — Trigger HUNTER agent
  server.post(
    "/hunter/run",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;

      const result = await runHunterAgent({
        personTitles: body.personTitles as string[] | undefined,
        organizationIndustries: body.organizationIndustries as string[] | undefined,
        personLocations: body.personLocations as string[] | undefined,
        employeeRanges: body.employeeRanges as string[] | undefined,
        maxResults: (body.maxResults as number) ?? 25,
        triggeredById: request.user.id,
        trigger: "api",
      });

      return {
        agentRunId: result.agentRunId,
        totalFound: result.totalFound,
        duplicates: result.duplicates,
        newLeads: result.newLeads.length,
        topLeads: result.newLeads.slice(0, 5).map((l) => ({
          name: l.person.name,
          title: l.person.title,
          company: l.person.organization?.name,
          fitScore: l.fitScore,
          fitReason: l.fitReason,
        })),
      };
    }
  );

  // POST /ai-agents/hunter/import/:runId — Import approved leads
  server.post(
    "/hunter/import/:runId",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const { runId } = request.params as { runId: string };
      const imported = await importHunterLeads(runId, request.user.id);
      return { imported };
    }
  );

  // POST /ai-agents/writer/draft — Draft email for a contact
  server.post(
    "/writer/draft",
    { preHandler: authorize("ADMIN", "MANAGER", "BD_STAFF") },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const contactId = body.contactId as string;
      if (!contactId) return reply.code(400).send({ error: "contactId is required" });

      const result = await runWriterAgent({
        contactId,
        emailType: (body.emailType as "initial" | "follow_up") ?? undefined,
        angle: body.angle as string | undefined,
        language: (body.language as "en" | "vi") ?? undefined,
        triggeredById: request.user.id,
        trigger: "api",
      });

      return {
        agentRunId: result.agentRunId,
        subject: result.subject,
        body: result.body,
        contactName: result.contactName,
        companyName: result.companyName,
      };
    }
  );

  // POST /ai-agents/writer/send/:runId — Send approved draft
  server.post(
    "/writer/send/:runId",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const { runId } = request.params as { runId: string };
      const sent = await sendApprovedDraft(runId, request.user.id);
      return { sent };
    }
  );

  // POST /ai-agents/writer/campaign/:campaignId — Batch draft for campaign
  server.post(
    "/writer/campaign/:campaignId",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const { campaignId } = request.params as { campaignId: string };
      const body = (request.body ?? {}) as Record<string, unknown>;
      const result = await draftForCampaign(campaignId, {
        language: (body.language as "en" | "vi") ?? undefined,
        angle: body.angle as string | undefined,
        triggeredById: request.user.id,
      });
      return result;
    }
  );

  // POST /ai-agents/tracker/cold — Manual cold lead analysis
  server.post(
    "/tracker/cold",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const result = await analyzeLeadsCold(request.user.id);
      return { agentRunId: result.agentRunId, leadsAnalyzed: result.leadsAnalyzed, analysis: result.analysis };
    }
  );

  // POST /ai-agents/tracker/weekly — Manual weekly insights
  server.post(
    "/tracker/weekly",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const result = await generateWeeklyInsights(request.user.id);
      return { agentRunId: result.agentRunId, insights: result.insights };
    }
  );

  // GET /ai-agents/runs — List agent runs
  server.get("/runs", async (request) => {
    const query = request.query as { limit?: string; agentType?: string };
    const limit = parseInt(query.limit ?? "20");

    const where: Record<string, unknown> = {};
    if (query.agentType) where.agentType = query.agentType;

    const runs = await prisma.agentRun.findMany({
      where,
      take: limit,
      orderBy: { startedAt: "desc" },
      include: {
        triggeredBy: { select: { name: true } },
        _count: { select: { actions: true } },
      },
    });

    return {
      runs: runs.map((r) => ({
        id: r.id,
        agentType: r.agentType,
        status: r.status,
        trigger: r.trigger,
        triggeredBy: r.triggeredBy?.name,
        tokensUsed: r.tokensUsed,
        actionsCount: r._count.actions,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        outputSummary: r.outputSummary,
      })),
    };
  });

  // GET /ai-agents/runs/:id — Agent run detail with actions
  server.get("/runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const run = await prisma.agentRun.findUnique({
      where: { id },
      include: {
        triggeredBy: { select: { name: true } },
        actions: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!run) {
      return reply.code(404).send({ error: "Agent run not found" });
    }

    return { run };
  });
}
