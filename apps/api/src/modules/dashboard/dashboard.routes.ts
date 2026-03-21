import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { authenticate } from "../../common/auth-guard";

export async function dashboardRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // GET /dashboard/stats
  server.get("/stats", async () => {
    const [
      totalContacts,
      totalCompanies,
      contactsByStatus,
      totalPipelineRevenue,
    ] = await Promise.all([
      prisma.contact.count(),
      prisma.company.count(),
      prisma.contact.groupBy({
        by: ["contactStatus"],
        _count: true,
      }),
      prisma.pipeline.aggregate({
        _sum: { totalRevenue: true },
        where: {
          dealStage: { notIn: ["CLOSED_LOST"] },
        },
      }),
    ]);

    const statusMap = Object.fromEntries(
      contactsByStatus.map((s) => [s.contactStatus, s._count])
    );

    return {
      totalContacts,
      totalCompanies,
      contactsByStatus: statusMap,
      totalPipelineRevenue: totalPipelineRevenue._sum.totalRevenue?.toString() ?? "0",
    };
  });

  // GET /dashboard/funnel
  server.get("/funnel", async () => {
    const funnel = await prisma.contact.groupBy({
      by: ["contactStatus"],
      _count: true,
      orderBy: { contactStatus: "asc" },
    });

    return {
      funnel: funnel.map((f) => ({
        status: f.contactStatus,
        count: f._count,
      })),
    };
  });

  // GET /dashboard/by-industry
  server.get("/by-industry", async () => {
    const result = await prisma.contact.groupBy({
      by: ["companyId"],
      _count: true,
    });

    // Get company details for industry
    const companyIds = result.map((r) => r.companyId);
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, industry: true },
    });

    const companyIndustryMap = Object.fromEntries(
      companies.map((c) => [c.id, c.industry])
    );

    const byIndustry: Record<string, number> = {};
    for (const r of result) {
      const industry = companyIndustryMap[r.companyId] ?? "OTHERS";
      byIndustry[industry] = (byIndustry[industry] ?? 0) + r._count;
    }

    return {
      byIndustry: Object.entries(byIndustry).map(([industry, count]) => ({
        industry,
        count,
      })),
    };
  });

  // GET /dashboard/by-pic
  server.get("/by-pic", async () => {
    const result = await prisma.contact.groupBy({
      by: ["assignedToId"],
      _count: true,
      where: { assignedToId: { not: null } },
    });

    const userIds = result.map((r) => r.assignedToId).filter(Boolean) as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });

    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

    return {
      byPic: result.map((r) => ({
        userId: r.assignedToId,
        name: userMap[r.assignedToId ?? ""] ?? "Unassigned",
        count: r._count,
      })),
    };
  });

  // GET /dashboard/recent-actions
  server.get("/recent-actions", async () => {
    const actions = await prisma.contactAction.findMany({
      take: 20,
      orderBy: { performedAt: "desc" },
      include: {
        contact: {
          select: { id: true, fullName: true },
        },
        performedBy: {
          select: { id: true, name: true },
        },
      },
    });

    return { actions };
  });

  // GET /dashboard/pipeline-chart
  server.get("/pipeline-chart", async () => {
    const pipelines = await prisma.pipeline.findMany({
      where: { dealStage: { notIn: ["CLOSED_LOST"] } },
      select: {
        totalRevenue: true,
        probability: true,
        monthlyRevenue: true,
        dealStage: true,
      },
    });

    return {
      pipelines: pipelines.map((p) => ({
        ...p,
        totalRevenue: p.totalRevenue.toString(),
      })),
    };
  });
}
