import type { FastifyInstance } from "fastify";
import { prisma, Prisma } from "@xperise/database";
import { createPipelineSchema, updatePipelineSchema, movePipelineStageSchema, pipelineFilterSchema } from "@xperise/shared";
import { authenticate, authorize } from "../../common/auth-guard";
import { createAuditLog } from "../../common/audit";

export async function pipelineRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // GET /pipelines
  server.get("/", async (request) => {
    const filters = pipelineFilterSchema.parse(request.query);

    const where: Prisma.PipelineWhereInput = {};
    if (filters.dealStage) where.dealStage = filters.dealStage as Prisma.EnumDealStageFilter;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.picId) where.picId = filters.picId;

    const pipelines = await prisma.pipeline.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, industry: true } },
        pic: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return { pipelines };
  });

  // GET /pipelines/summary
  server.get("/summary", async () => {
    const pipelines = await prisma.pipeline.findMany({
      include: {
        company: { select: { name: true } },
      },
    });

    const byStage = pipelines.reduce(
      (acc, p) => {
        if (!acc[p.dealStage]) acc[p.dealStage] = { count: 0, totalRevenue: BigInt(0), weightedRevenue: BigInt(0) };
        acc[p.dealStage].count += 1;
        acc[p.dealStage].totalRevenue += p.totalRevenue;
        acc[p.dealStage].weightedRevenue += BigInt(Math.round(Number(p.totalRevenue) * p.probability));
        return acc;
      },
      {} as Record<string, { count: number; totalRevenue: bigint; weightedRevenue: bigint }>
    );

    // Convert BigInt to string for JSON serialization
    const summary = Object.entries(byStage).map(([stage, data]) => ({
      stage,
      count: data.count,
      totalRevenue: data.totalRevenue.toString(),
      weightedRevenue: data.weightedRevenue.toString(),
    }));

    return { summary };
  });

  // POST /pipelines
  server.post(
    "/",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request) => {
      const data = createPipelineSchema.parse(request.body);

      const pipeline = await prisma.pipeline.create({
        data: {
          ...data,
          totalRevenue: BigInt(data.totalRevenue),
        },
        include: {
          company: { select: { id: true, name: true } },
        },
      });

      await createAuditLog({
        userId: request.user.id,
        action: "create",
        entity: "pipeline",
        entityId: pipeline.id,
      });

      return { pipeline: { ...pipeline, totalRevenue: pipeline.totalRevenue.toString() } };
    }
  );

  // PUT /pipelines/:id/stage (Kanban drag)
  server.put<{ Params: { id: string } }>(
    "/:id/stage",
    { preHandler: authorize("ADMIN", "MANAGER", "BD_STAFF") },
    async (request, reply) => {
      const { dealStage } = movePipelineStageSchema.parse(request.body);

      const existing = await prisma.pipeline.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Pipeline not found" });
      }

      const pipeline = await prisma.pipeline.update({
        where: { id: request.params.id },
        data: { dealStage },
        include: {
          company: { select: { id: true, name: true } },
        },
      });

      await createAuditLog({
        userId: request.user.id,
        action: "update",
        entity: "pipeline",
        entityId: pipeline.id,
        changes: { dealStage: { old: existing.dealStage, new: dealStage } },
      });

      return { pipeline: { ...pipeline, totalRevenue: pipeline.totalRevenue.toString() } };
    }
  );

  // PUT /pipelines/:id
  server.put<{ Params: { id: string } }>(
    "/:id",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async (request, reply) => {
      const data = updatePipelineSchema.parse(request.body);

      const existing = await prisma.pipeline.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Pipeline not found" });
      }

      const pipeline = await prisma.pipeline.update({
        where: { id: request.params.id },
        data: {
          ...data,
          totalRevenue: data.totalRevenue !== undefined ? BigInt(data.totalRevenue) : undefined,
        },
      });

      return { pipeline: { ...pipeline, totalRevenue: pipeline.totalRevenue.toString() } };
    }
  );
}
