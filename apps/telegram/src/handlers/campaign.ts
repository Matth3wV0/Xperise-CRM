import type { Context } from "grammy";
import { prisma } from "@xperise/database";
import { rp } from "../lib/rp.js";
import { formatDate } from "../lib/formatter.js";

const STATUS_ICON: Record<string, string> = {
  DRAFT: "📝",
  ACTIVE: "🟢",
  PAUSED: "⏸",
  COMPLETED: "✅",
  CANCELLED: "🚫",
};

/**
 * /campaign [name or id]
 * Without args: list all campaigns with summary stats.
 * With args: show detailed stats for a specific campaign.
 */
export async function handleCampaign(ctx: Context) {
  const query = (ctx.match as string)?.trim();

  if (!query) {
    return listCampaigns(ctx);
  }

  return campaignDetail(ctx, query);
}

async function listCampaigns(ctx: Context) {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
    include: {
      _count: { select: { recipients: true, emailLogs: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (campaigns.length === 0) {
    await ctx.reply("Chưa có campaign nào. Tạo campaign trên web app.", { ...rp(ctx) });
    return;
  }

  let msg = "<b>📋 Campaigns gần nhất</b>\n\n";

  for (const c of campaigns) {
    const icon = STATUS_ICON[c.status] ?? "📝";
    const recipientCount = c._count.recipients;
    const emailCount = c._count.emailLogs;
    const apollo = c.apolloSequenceId ? " 🔗" : "";

    msg += `${icon} <b>${c.name}</b>${apollo}\n`;
    msg += `   ${c.status} | ${recipientCount} recipients | ${emailCount} emails\n`;
    msg += `   Tạo: ${formatDate(c.createdAt)} bởi ${c.createdBy.name}\n\n`;
  }

  msg += "<i>Xem chi tiết:</i> <code>/campaign &lt;tên&gt;</code>";

  await ctx.reply(msg, { ...rp(ctx), parse_mode: "HTML" });
}

async function campaignDetail(ctx: Context, query: string) {
  // Try ID first, then fuzzy name match
  let campaign = await prisma.campaign.findUnique({
    where: { id: query },
    include: {
      createdBy: { select: { name: true } },
      recipients: {
        include: { contact: { select: { fullName: true, email: true } } },
      },
      emailLogs: true,
      steps: { orderBy: { stepOrder: "asc" } },
    },
  });

  if (!campaign) {
    campaign = await prisma.campaign.findFirst({
      where: { name: { contains: query, mode: "insensitive" } },
      include: {
        createdBy: { select: { name: true } },
        recipients: {
          include: { contact: { select: { fullName: true, email: true } } },
        },
        emailLogs: true,
        steps: { orderBy: { stepOrder: "asc" } },
      },
    });
  }

  if (!campaign) {
    await ctx.reply(
      `❌ Không tìm thấy campaign: <b>${query}</b>\n\nThử <code>/campaign</code> để xem danh sách.`,
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  const icon = STATUS_ICON[campaign.status] ?? "📝";
  const apollo = campaign.apolloSequenceId
    ? `\n🔗 Apollo Sequence: <code>${campaign.apolloSequenceId}</code>`
    : "";

  // Recipient status breakdown
  const recipientStatuses: Record<string, number> = {};
  for (const r of campaign.recipients) {
    recipientStatuses[r.status] = (recipientStatuses[r.status] || 0) + 1;
  }

  // Email stats
  const totalEmails = campaign.emailLogs.length;
  const sent = campaign.emailLogs.filter((e) => e.sentAt).length;
  const opened = campaign.emailLogs.filter((e) => e.openedAt).length;
  const replied = campaign.emailLogs.filter((e) => e.repliedAt).length;
  const bounced = campaign.emailLogs.filter((e) => e.bouncedAt).length;

  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : "0";
  const replyRate = sent > 0 ? ((replied / sent) * 100).toFixed(1) : "0";

  let msg = `${icon} <b>${campaign.name}</b>\n`;
  msg += `Status: <b>${campaign.status}</b>\n`;
  msg += `Tạo: ${formatDate(campaign.createdAt)} bởi ${campaign.createdBy.name}${apollo}\n`;

  // Steps
  if (campaign.steps.length > 0) {
    msg += `\n<b>📨 Steps (${campaign.steps.length}):</b>\n`;
    for (const s of campaign.steps) {
      const delay = s.delayDays > 0 ? ` (+${s.delayDays}d)` : "";
      msg += `   ${s.stepOrder + 1}. ${s.subject}${delay}\n`;
    }
  }

  // Recipients breakdown
  msg += `\n<b>👥 Recipients (${campaign.recipients.length}):</b>\n`;
  if (Object.keys(recipientStatuses).length > 0) {
    for (const [status, count] of Object.entries(recipientStatuses)) {
      msg += `   ${status}: ${count}\n`;
    }
  } else {
    msg += "   <i>Chưa có recipients</i>\n";
  }

  // Email stats
  if (totalEmails > 0) {
    msg += `\n<b>📊 Email Stats:</b>\n`;
    msg += `   📤 Sent: ${sent}\n`;
    msg += `   👁 Opened: ${opened} (${openRate}%)\n`;
    msg += `   💬 Replied: ${replied} (${replyRate}%)\n`;
    msg += `   ❌ Bounced: ${bounced}\n`;
  }

  // Campaign ID for quick actions
  msg += `\n<i>ID:</i> <code>${campaign.id}</code>`;

  await ctx.reply(msg, { ...rp(ctx), parse_mode: "HTML" });
}
