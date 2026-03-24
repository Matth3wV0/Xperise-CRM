import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { authenticate } from "../../common/auth-guard";

export async function dashboardRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authenticate);

  // GET /dashboard/stats — with week-over-week comparison
  server.get("/stats", async (request) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

    // BD_STAFF only sees their own contacts (mirrors contacts.routes.ts logic)
    const contactWhere =
      request.user.role === "BD_STAFF"
        ? { assignedToId: request.user.id }
        : {};

    const [
      totalContacts,
      totalCompanies,
      contactsByStatus,
      totalPipelineRevenue,
      // Period comparison data
      contactsThisWeek,
      contactsLastWeek,
      actionsThisWeek,
      actionsLastWeek,
      meetingsThisWeek,
      meetingsLastWeek,
    ] = await Promise.all([
      prisma.contact.count({ where: contactWhere }),
      prisma.company.count(),
      prisma.contact.groupBy({ by: ["contactStatus"], _count: true, where: contactWhere }),
      prisma.pipeline.aggregate({
        _sum: { totalRevenue: true },
        where: { dealStage: { notIn: ["CLOSED_LOST"] } },
      }),
      // This week
      prisma.contact.count({ where: { ...contactWhere, createdAt: { gte: weekAgo } } }),
      prisma.contact.count({ where: { ...contactWhere, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.contactAction.count({ where: { performedAt: { gte: weekAgo } } }),
      prisma.contactAction.count({ where: { performedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.contactAction.count({
        where: { type: "MEETING", performedAt: { gte: weekAgo } },
      }),
      prisma.contactAction.count({
        where: { type: "MEETING", performedAt: { gte: twoWeeksAgo, lt: weekAgo } },
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
      comparison: {
        newContacts: { current: contactsThisWeek, previous: contactsLastWeek },
        activities: { current: actionsThisWeek, previous: actionsLastWeek },
        meetings: { current: meetingsThisWeek, previous: meetingsLastWeek },
      },
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

  // GET /dashboard/outreach-stats — email campaign performance
  server.get("/outreach-stats", async () => {
    const [activeCampaigns, totalRecipients, emailStats] = await Promise.all([
      prisma.campaign.count({ where: { status: "ACTIVE" } }),
      prisma.campaignRecipient.count(),
      prisma.emailLog.aggregate({
        _count: { id: true },
        where: { campaignId: { not: null } },
      }),
    ]);

    const emailStatusBreakdown = await prisma.emailLog.groupBy({
      by: ["status"],
      _count: true,
      where: { campaignId: { not: null } },
    });

    const openedCount = await prisma.emailLog.count({
      where: { campaignId: { not: null }, openedAt: { not: null } },
    });
    const repliedCount = await prisma.emailLog.count({
      where: { campaignId: { not: null }, repliedAt: { not: null } },
    });
    const bouncedCount = await prisma.emailLog.count({
      where: { campaignId: { not: null }, bouncedAt: { not: null } },
    });

    const totalSent = emailStats._count.id;
    const openRate = totalSent > 0 ? ((openedCount / totalSent) * 100).toFixed(1) : "0";
    const replyRate = totalSent > 0 ? ((repliedCount / totalSent) * 100).toFixed(1) : "0";
    const bounceRate = totalSent > 0 ? ((bouncedCount / totalSent) * 100).toFixed(1) : "0";

    // Recent campaigns with stats
    const recentCampaigns = await prisma.campaign.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      where: { status: { in: ["ACTIVE", "COMPLETED"] } },
      select: {
        id: true,
        name: true,
        status: true,
        _count: { select: { recipients: true, emailLogs: true } },
      },
    });

    return {
      activeCampaigns,
      totalRecipients,
      totalSent,
      opened: openedCount,
      replied: repliedCount,
      bounced: bouncedCount,
      openRate,
      replyRate,
      bounceRate,
      statusBreakdown: Object.fromEntries(
        emailStatusBreakdown.map((s) => [s.status, s._count])
      ),
      recentCampaigns: recentCampaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        recipients: c._count.recipients,
        emails: c._count.emailLogs,
      })),
    };
  });

  // GET /dashboard/action-required — Companies/contacts needing attention based on SLA
  server.get("/action-required", async () => {
    const SLA_DAYS: Record<string, number> = {
      NO_CONTACT: 7,
      CONTACT: 5,
      REACHED: 3,
      FOLLOW_UP: 1,
      MEETING_BOOKED: 999, // Handled by meeting date
      MET: 7,
    };

    // Get active contacts (not terminal states)
    const contacts = await prisma.contact.findMany({
      where: {
        contactStatus: { notIn: ["CONVERTED", "LOST", "NURTURE"] },
      },
      include: {
        company: { select: { id: true, name: true, industry: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { lastTouchedAt: "asc" },
    });

    const now = Date.now();
    const items: {
      contactId: string;
      contactName: string;
      position: string | null;
      companyId: string;
      companyName: string;
      industry: string;
      stage: string;
      daysInStage: number;
      daysSinceTouch: number;
      slaDays: number | null;
      slaOverdue: boolean;
      urgency: "urgent" | "warning" | "normal";
      signal: string;
      assignedTo: string | null;
    }[] = [];

    for (const c of contacts) {
      const slaDays = SLA_DAYS[c.contactStatus] ?? null;
      const stageDate = c.stageChangedAt ?? c.createdAt;
      const daysInStage = Math.floor((now - new Date(stageDate).getTime()) / 86400000);
      const daysSinceTouch = c.lastTouchedAt
        ? Math.floor((now - new Date(c.lastTouchedAt).getTime()) / 86400000)
        : 999;
      const slaOverdue = slaDays != null && daysInStage > slaDays;

      // Determine urgency
      let urgency: "urgent" | "warning" | "normal" = "normal";
      if (c.contactStatus === "FOLLOW_UP" && daysSinceTouch >= 1) urgency = "urgent";
      else if (slaOverdue) urgency = "warning";
      else if (daysSinceTouch > 7) urgency = "warning";

      // Generate signal
      let signal = "";
      if (c.contactStatus === "FOLLOW_UP" && daysSinceTouch >= 1) {
        signal = `Lead engaged, ${daysSinceTouch === 999 ? "chưa ai respond" : `${daysSinceTouch}d chưa respond`}`;
      } else if (slaOverdue && slaDays != null) {
        signal = `Quá SLA ${slaDays}d (đang ${daysInStage}d)`;
      } else if (daysSinceTouch > 14) {
        signal = `Im lặng ${daysSinceTouch}d`;
      } else if (daysSinceTouch > 7) {
        signal = `${daysSinceTouch}d chưa touch`;
      } else {
        signal = `${daysInStage}d in stage`;
      }

      items.push({
        contactId: c.id,
        contactName: c.fullName,
        position: c.position,
        companyId: c.company.id,
        companyName: c.company.name,
        industry: c.company.industry,
        stage: c.contactStatus,
        daysInStage,
        daysSinceTouch,
        slaDays,
        slaOverdue,
        urgency,
        signal,
        assignedTo: c.assignedTo?.name ?? null,
      });
    }

    // Sort: urgent first, then warning, then normal. Within each: most overdue first
    const urgencyOrder = { urgent: 0, warning: 1, normal: 2 };
    items.sort((a, b) => {
      const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (uDiff !== 0) return uDiff;
      return b.daysSinceTouch - a.daysSinceTouch;
    });

    return { items: items.slice(0, 20) };
  });

  // GET /dashboard/progress — weekly comparison, stage movement, monthly trends
  server.get("/progress", async () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

    // --- Weekly comparison table ---
    const [
      emailsSentThisWeek, emailsSentLastWeek,
      emailsOpenedThisWeek, emailsOpenedLastWeek,
      emailsRepliedThisWeek, emailsRepliedLastWeek,
      linkedinThisWeek, linkedinLastWeek,
      meetingsThisWeek, meetingsLastWeek,
      newCompaniesThisWeek, newCompaniesLastWeek,
    ] = await Promise.all([
      prisma.contactAction.count({ where: { type: { in: ["EMAIL_SENT", "EMAIL_FOLLOW_UP"] }, performedAt: { gte: weekAgo } } }),
      prisma.contactAction.count({ where: { type: { in: ["EMAIL_SENT", "EMAIL_FOLLOW_UP"] }, performedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.emailLog.count({ where: { openedAt: { not: null, gte: weekAgo } } }),
      prisma.emailLog.count({ where: { openedAt: { not: null, gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.emailLog.count({ where: { repliedAt: { not: null, gte: weekAgo } } }),
      prisma.emailLog.count({ where: { repliedAt: { not: null, gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.contactAction.count({ where: { type: { in: ["LINKEDIN_CONNECT", "LINKEDIN_MESSAGE"] }, performedAt: { gte: weekAgo } } }),
      prisma.contactAction.count({ where: { type: { in: ["LINKEDIN_CONNECT", "LINKEDIN_MESSAGE"] }, performedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.contactAction.count({ where: { type: "MEETING", performedAt: { gte: weekAgo } } }),
      prisma.contactAction.count({ where: { type: "MEETING", performedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.company.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.company.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    ]);

    const weeklyComparison = [
      { metric: "Emails sent", current: emailsSentThisWeek, previous: emailsSentLastWeek },
      { metric: "Emails opened", current: emailsOpenedThisWeek, previous: emailsOpenedLastWeek },
      { metric: "Emails replied", current: emailsRepliedThisWeek, previous: emailsRepliedLastWeek },
      { metric: "LinkedIn actions", current: linkedinThisWeek, previous: linkedinLastWeek },
      { metric: "Meetings", current: meetingsThisWeek, previous: meetingsLastWeek },
      { metric: "New companies", current: newCompaniesThisWeek, previous: newCompaniesLastWeek },
    ];

    // --- Stage movement this week ---
    // Find contacts whose status changed this week via ContactAction STATUS_CHANGE
    const statusChanges = await prisma.contactAction.findMany({
      where: {
        type: "STATUS_CHANGE",
        performedAt: { gte: weekAgo },
      },
      include: {
        contact: {
          select: { id: true, fullName: true, contactStatus: true },
          include: { company: { select: { name: true } } },
        },
      },
      orderBy: { performedAt: "desc" },
    });

    // Promoted: contacts that moved to a higher stage
    const promoted: { company: string; contact: string; fromTo: string }[] = [];
    const lost: { company: string; contact: string; reason: string }[] = [];
    for (const sc of statusChanges) {
      const note = sc.note ?? "";
      const match = note.match(/Status: (.+) → (.+)/);
      if (match) {
        const item = {
          company: (sc.contact as any).company?.name ?? "?",
          contact: sc.contact.fullName,
          fromTo: `${match[1]} → ${match[2]}`,
        };
        if (match[2].includes("Lost")) {
          lost.push({ ...item, reason: note });
        } else {
          promoted.push(item);
        }
      }
    }

    // New contacts this week
    const newContacts = await prisma.contact.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: {
        fullName: true,
        company: { select: { name: true } },
      },
      take: 10,
    });

    // Stuck: active contacts with SLA overdue
    const stuckContacts = await prisma.contact.findMany({
      where: {
        contactStatus: { in: ["REACHED", "FOLLOW_UP", "MET"] },
        lastTouchedAt: { lt: new Date(now.getTime() - 10 * 86400000) },
      },
      select: {
        fullName: true,
        contactStatus: true,
        lastTouchedAt: true,
        company: { select: { name: true } },
      },
      orderBy: { lastTouchedAt: "asc" },
      take: 10,
    });

    const stageMovement = {
      promoted: promoted.slice(0, 10),
      stuck: stuckContacts.map((c) => ({
        company: c.company.name,
        contact: c.fullName,
        stage: c.contactStatus,
        daysSinceTouch: c.lastTouchedAt
          ? Math.floor((now.getTime() - c.lastTouchedAt.getTime()) / 86400000)
          : 999,
      })),
      lost: lost.slice(0, 5),
      newEntries: newContacts.map((c) => ({
        company: c.company.name,
        contact: c.fullName,
      })),
    };

    return { weeklyComparison, stageMovement };
  });

  // GET /dashboard/outreach-analytics — detailed outreach metrics
  server.get("/outreach-analytics", async () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    // Email by status (last 30 days)
    const emailsByStatus = await prisma.emailLog.groupBy({
      by: ["status"],
      _count: true,
      where: { sentAt: { gte: thirtyDaysAgo } },
    });

    // Channel effectiveness: actions by type with outcome
    const actionsByType = await prisma.contactAction.groupBy({
      by: ["type"],
      _count: true,
      where: { performedAt: { gte: thirtyDaysAgo } },
    });

    // Top subject lines (opened emails)
    const topSubjects = await prisma.emailLog.findMany({
      where: { openedAt: { not: null }, sentAt: { gte: thirtyDaysAgo } },
      select: { subject: true },
    });
    const subjectCounts: Record<string, number> = {};
    for (const e of topSubjects) {
      subjectCounts[e.subject] = (subjectCounts[e.subject] ?? 0) + 1;
    }
    const topSubjectList = Object.entries(subjectCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([subject, opens]) => ({ subject, opens }));

    // Send time analysis (hour of day → open count)
    const allEmails = await prisma.emailLog.findMany({
      where: { sentAt: { gte: thirtyDaysAgo } },
      select: { sentAt: true, openedAt: true },
    });
    const hourBuckets: { hour: number; sent: number; opened: number }[] = Array.from(
      { length: 24 },
      (_, h) => ({ hour: h, sent: 0, opened: 0 })
    );
    for (const e of allEmails) {
      const h = new Date(e.sentAt).getHours();
      hourBuckets[h].sent++;
      if (e.openedAt) hourBuckets[h].opened++;
    }

    // Campaign sequence completion
    const campaigns = await prisma.campaign.findMany({
      where: { status: { in: ["ACTIVE", "COMPLETED"] } },
      select: {
        id: true,
        name: true,
        _count: { select: { steps: true } },
        recipients: {
          select: { currentStep: true, status: true },
        },
      },
      take: 10,
      orderBy: { updatedAt: "desc" },
    });

    const sequenceCompletion = campaigns.map((c) => {
      const totalSteps = c._count.steps;
      const totalRecipients = c.recipients.length;
      const completed = c.recipients.filter((r) => r.currentStep >= totalSteps).length;
      const replied = c.recipients.filter((r) => r.status === "REPLIED").length;
      const bounced = c.recipients.filter((r) => r.status === "BOUNCED").length;
      return {
        name: c.name,
        totalRecipients,
        completed,
        replied,
        bounced,
        completionRate: totalRecipients > 0 ? Math.round((completed / totalRecipients) * 100) : 0,
      };
    });

    return {
      emailsByStatus: Object.fromEntries(emailsByStatus.map((s) => [s.status, s._count])),
      channelActivity: actionsByType.map((a) => ({ type: a.type, count: a._count })),
      topSubjects: topSubjectList,
      sendTimeHeatmap: hourBuckets.filter((b) => b.sent > 0),
      sequenceCompletion,
    };
  });

  // GET /dashboard/team-activity — per-person activity metrics
  server.get("/team-activity", async () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    // Activities per person this week
    const actionsPerPerson = await prisma.contactAction.groupBy({
      by: ["performedById"],
      _count: true,
      where: { performedAt: { gte: weekAgo } },
    });

    const userIds = actionsPerPerson.map((a) => a.performedById);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    // Contacts managed per person
    const contactsPerPerson = await prisma.contact.groupBy({
      by: ["assignedToId"],
      _count: true,
      where: { assignedToId: { not: null } },
    });
    const contactCountMap = Object.fromEntries(
      contactsPerPerson.map((c) => [c.assignedToId ?? "", c._count])
    );

    // Response time to engaged leads (FOLLOW_UP contacts — time from stageChangedAt to first action after)
    // Approximation: use daysSince for engaged leads
    const engagedLeads = await prisma.contact.findMany({
      where: {
        contactStatus: "FOLLOW_UP",
        stageChangedAt: { not: null },
        assignedToId: { not: null },
      },
      select: {
        assignedToId: true,
        stageChangedAt: true,
        lastTouchedAt: true,
      },
    });

    const responseTimeByUser: Record<string, number[]> = {};
    for (const lead of engagedLeads) {
      if (!lead.assignedToId || !lead.stageChangedAt || !lead.lastTouchedAt) continue;
      const responseHours = Math.max(
        0,
        (lead.lastTouchedAt.getTime() - lead.stageChangedAt.getTime()) / 3600000
      );
      (responseTimeByUser[lead.assignedToId] ??= []).push(responseHours);
    }

    const teamMembers = actionsPerPerson.map((a) => {
      const user = userMap[a.performedById];
      const responseTimes = responseTimeByUser[a.performedById] ?? [];
      const avgResponseHours = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length)
        : null;

      return {
        userId: a.performedById,
        name: user?.name ?? "Unknown",
        role: user?.role ?? "BD_STAFF",
        activitiesThisWeek: a._count,
        contactsManaged: contactCountMap[a.performedById] ?? 0,
        avgResponseHours,
      };
    });

    // Sort by activities descending
    teamMembers.sort((a, b) => b.activitiesThisWeek - a.activitiesThisWeek);

    return { teamMembers };
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
