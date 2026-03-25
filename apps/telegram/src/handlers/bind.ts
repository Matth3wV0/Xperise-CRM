import type { Context } from "grammy";
import { prisma } from "@xperise/database";
import { rp } from "../lib/rp.js";

export async function handleBind(ctx: Context) {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Vui lòng dùng lệnh /bind trong <b>chat riêng</b> với bot để bảo mật code.", {
      parse_mode: "HTML",
    });
    return;
  }

  const args = (ctx.match as string)?.trim();
  if (!args) {
    await ctx.reply(
      "Vui lòng nhập code:\n<code>/bind YOUR_CODE</code>\n\nLấy code tại <b>Settings → Telegram</b> trong web app.",
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  const code = args.toUpperCase();
  const telegramId = String(ctx.from!.id);
  const telegramName = ctx.from?.username
    ? `@${ctx.from.username}`
    : ctx.from?.first_name ?? "Unknown";
  const chatId = String(ctx.chat!.id);

  // Already bound?
  const existing = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { name: true } } },
  });

  if (existing) {
    await ctx.reply(
      `Tài khoản Telegram này đã được link với <b>${existing.user.name}</b>.\nNếu muốn đổi, liên hệ Admin.`,
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  // Find user by bind code
  const user = await prisma.user.findUnique({
    where: { telegramBindCode: code },
    select: {
      id: true,
      name: true,
      role: true,
      telegramBindCodeExpiry: true,
      telegramBinding: true,
    },
  });

  if (!user) {
    await ctx.reply(
      "❌ Code không hợp lệ. Vui lòng lấy code mới tại <b>Settings → Telegram</b> trong web app.",
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  if (user.telegramBindCodeExpiry && new Date() > user.telegramBindCodeExpiry) {
    await ctx.reply(
      "❌ Code đã hết hạn (10 phút). Vui lòng lấy code mới tại <b>Settings → Telegram</b>.",
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  if (user.telegramBinding) {
    await ctx.reply("Tài khoản này đã được link với một Telegram khác rồi. Liên hệ Admin.", { ...rp(ctx) });
    return;
  }

  // Create binding + clear code atomically
  await prisma.$transaction([
    prisma.telegramBinding.create({
      data: { telegramId, telegramName, chatId, userId: user.id },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { telegramBindCode: null, telegramBindCodeExpiry: null },
    }),
  ]);

  await ctx.reply(
    `✅ <b>Link tài khoản thành công!</b>\n\n` +
      `👤 ${user.name} (${user.role})\n\n` +
      `Bây giờ bạn có thể cập nhật status trong group:\n` +
      `<code>[Tên công ty] Nội dung update</code>`,
    { ...rp(ctx), parse_mode: "HTML" }
  );
}
