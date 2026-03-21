import type { Context } from "grammy";
import { prisma } from "@xperise/database";
import { HELP_TEXT } from "../lib/formatter.js";

export async function handleStart(ctx: Context) {
  if (ctx.chat?.type !== "private") return;

  const telegramId = String(ctx.from?.id);

  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { name: true, role: true } } },
  });

  if (binding) {
    await ctx.reply(
      `👋 Xin chào <b>${binding.user.name}</b>! (${binding.user.role})\n\nTài khoản đã được link. Bạn có thể dùng bot trong group của team.\n\n${HELP_TEXT}`,
      { parse_mode: "HTML" }
    );
    return;
  }

  await ctx.reply(
    `👋 Chào mừng đến với <b>Xperise BD Bot</b>!\n\n` +
      `Để sử dụng bot, bạn cần link tài khoản:\n` +
      `1. Vào <b>Settings</b> trong web app\n` +
      `2. Click <b>"Lấy mã Telegram"</b> để lấy code 6 ký tự\n` +
      `3. Gửi lệnh tại đây: <code>/bind YOUR_CODE</code>\n\n` +
      `Sau khi link xong, bạn có thể cập nhật status trong group bằng:\n` +
      `<code>[Tên công ty] Nội dung update</code>`,
    { parse_mode: "HTML" }
  );
}
