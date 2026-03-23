import type { Context } from "grammy";
import { prisma } from "@xperise/database";

/**
 * /approve <campaignId>
 * Approves all PENDING_APPROVAL recipients in a campaign.
 * Only ADMIN or MANAGER can approve.
 */
export async function handleApprove(ctx: Context) {
  const telegramId = String(ctx.from?.id);
  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  if (!binding) {
    await ctx.reply("Bạn chưa link tài khoản. Dùng /start để xem hướng dẫn.");
    return;
  }

  if (!["ADMIN", "MANAGER"].includes(binding.user.role)) {
    await ctx.reply("⛔ Chỉ ADMIN hoặc MANAGER mới có thể duyệt campaign.");
    return;
  }

  const campaignId = (ctx.match as string)?.trim();
  if (!campaignId) {
    await ctx.reply(
      "Vui lòng cung cấp campaign ID:\n<code>/approve &lt;campaignId&gt;</code>",
      { parse_mode: "HTML" }
    );
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    await ctx.reply(`❌ Không tìm thấy campaign <code>${campaignId}</code>.`, {
      parse_mode: "HTML",
    });
    return;
  }

  const result = await prisma.campaignRecipient.updateMany({
    where: { campaignId, status: "PENDING_APPROVAL" },
    data: { status: "APPROVED" },
  });

  if (result.count === 0) {
    await ctx.reply(
      `ℹ️ Không có email nào đang chờ duyệt trong campaign <b>${campaign.name}</b>.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  await ctx.reply(
    `✅ <b>Đã duyệt ${result.count} email</b> trong campaign <b>${campaign.name}</b>.\n` +
      `Trạng thái: PENDING_APPROVAL → APPROVED`,
    { parse_mode: "HTML" }
  );
}

/**
 * /reject <campaignId> [reason]
 * Rejects all PENDING_APPROVAL recipients in a campaign.
 * Only ADMIN or MANAGER can reject.
 */
export async function handleReject(ctx: Context) {
  const telegramId = String(ctx.from?.id);
  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  if (!binding) {
    await ctx.reply("Bạn chưa link tài khoản. Dùng /start để xem hướng dẫn.");
    return;
  }

  if (!["ADMIN", "MANAGER"].includes(binding.user.role)) {
    await ctx.reply("⛔ Chỉ ADMIN hoặc MANAGER mới có thể từ chối campaign.");
    return;
  }

  const args = ((ctx.match as string) ?? "").trim().split(/\s+/);
  const campaignId = args[0];
  const reason = args.slice(1).join(" ") || "Từ chối qua Telegram";

  if (!campaignId) {
    await ctx.reply(
      "Vui lòng cung cấp campaign ID:\n<code>/reject &lt;campaignId&gt; [lý do]</code>",
      { parse_mode: "HTML" }
    );
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    await ctx.reply(`❌ Không tìm thấy campaign <code>${campaignId}</code>.`, {
      parse_mode: "HTML",
    });
    return;
  }

  const result = await prisma.campaignRecipient.updateMany({
    where: { campaignId, status: "PENDING_APPROVAL" },
    data: { status: "REJECTED" },
  });

  if (result.count === 0) {
    await ctx.reply(
      `ℹ️ Không có email nào đang chờ duyệt trong campaign <b>${campaign.name}</b>.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  await ctx.reply(
    `🚫 <b>Đã từ chối ${result.count} email</b> trong campaign <b>${campaign.name}</b>.\n` +
      `Lý do: ${reason}`,
    { parse_mode: "HTML" }
  );
}

/**
 * Handle inline keyboard callbacks for campaign approval:
 * ca:<campaignId> — approve all
 * cr:<campaignId> — reject all
 */
export async function handleCampaignCallback(
  ctx: Context,
  data: string
): Promise<boolean> {
  if (!data.startsWith("ca:") && !data.startsWith("cr:")) return false;

  await ctx.answerCallbackQuery();

  const telegramId = String(ctx.from?.id);
  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  if (!binding || !["ADMIN", "MANAGER"].includes(binding.user.role)) {
    await ctx.answerCallbackQuery("⛔ Chỉ ADMIN/MANAGER mới có thể duyệt.");
    return true;
  }

  const campaignId = data.slice(3); // strip "ca:" or "cr:"
  const isApprove = data.startsWith("ca:");

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    const original = ctx.callbackQuery?.message?.text ?? "";
    await ctx.editMessageText(original + "\n\n❌ Campaign không còn tồn tại.", {
      parse_mode: "HTML",
    });
    return true;
  }

  const result = await prisma.campaignRecipient.updateMany({
    where: { campaignId, status: "PENDING_APPROVAL" },
    data: { status: isApprove ? "APPROVED" : "REJECTED" },
  });

  const original = ctx.callbackQuery?.message?.text ?? "";
  const splitPoint = original.indexOf("\nDùng");
  const preview = splitPoint > 0 ? original.substring(0, splitPoint) : original;

  if (isApprove) {
    await ctx.editMessageText(
      preview +
        `\n\n✅ <b>${binding.user.name}</b> đã duyệt ${result.count} email.`,
      { parse_mode: "HTML" }
    );
  } else {
    await ctx.editMessageText(
      preview +
        `\n\n🚫 <b>${binding.user.name}</b> đã từ chối ${result.count} email.`,
      { parse_mode: "HTML" }
    );
  }

  return true;
}
