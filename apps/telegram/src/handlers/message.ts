import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "@xperise/database";
import { parseGroupMessage } from "../lib/parser.js";
import { findCompanyByName, findPrimaryContact } from "../lib/fuzzy.js";
import {
  STATUS_LABELS,
  STATUS_EMOJI,
  ACTIONABLE_STATUSES,
} from "../lib/formatter.js";

export async function handleGroupMessage(ctx: Context) {
  const text = ctx.message?.text;
  if (!text) return;

  // Only handle [Company] note pattern
  const parsed = parseGroupMessage(text);
  if (!parsed) return;

  // Detect anonymous admin (Telegram replaces identity with GroupAnonymousBot)
  if (ctx.from?.id === 1087968824) {
    await ctx.reply(
      "⚠️ Bot không nhận diện được bạn vì đang gửi ẩn danh.\n" +
        "Vào <b>Group Settings → Administrators</b>, tìm tên bạn và tắt <b>\"Hide Admin Identity\"</b>, rồi gửi lại.",
      { parse_mode: "HTML" }
    );
    return;
  }

  const telegramId = String(ctx.from?.id);

  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  // Silently ignore unbound users — don't spam group with auth errors
  if (!binding) return;

  // Find company by fuzzy name
  const company = await findCompanyByName(parsed.companyName);
  if (!company) {
    await ctx.reply(
      `❓ Không tìm thấy công ty <b>${parsed.companyName}</b>.\n` +
        `Kiểm tra lại tên hoặc thêm vào web app.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // Find primary contact to log action against
  const contact = await findPrimaryContact(
    company.id,
    binding.user.id,
    binding.user.role
  );

  if (!contact) {
    await ctx.reply(
      `⚠️ <b>${company.name}</b> chưa có contacts nào. Thêm contact trong web app trước.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // Log action + update lastTouchedAt atomically
  await prisma.$transaction([
    prisma.contactAction.create({
      data: {
        type: "NOTE",
        status: "DONE",
        note: parsed.note,
        contactId: contact.id,
        performedById: binding.user.id,
        metadata: { source: "telegram", companyQuery: parsed.companyName },
      },
    }),
    prisma.contact.update({
      where: { id: contact.id },
      data: { lastTouchedAt: new Date() },
    }),
  ]);

  const currentEmoji = STATUS_EMOJI[contact.contactStatus] ?? "⚪";
  const currentLabel = STATUS_LABELS[contact.contactStatus] ?? contact.contactStatus;
  const notePreview =
    parsed.note.length > 120
      ? parsed.note.substring(0, 120) + "..."
      : parsed.note;

  // Build inline keyboard for status update
  const keyboard = new InlineKeyboard();
  const nextStatuses = ACTIONABLE_STATUSES.filter(
    (s) => s !== contact.contactStatus
  );

  // Max 2 buttons per row
  for (let i = 0; i < nextStatuses.length; i++) {
    const s = nextStatuses[i];
    keyboard.text(STATUS_LABELS[s], `su:${contact.id}:${s}`);
    if (i % 2 === 1) keyboard.row();
  }
  keyboard.row().text("✓ Giữ nguyên", `ig:${contact.id}`);

  const confirmMsg =
    `✅ <b>Đã ghi nhận:</b>\n` +
    `🏢 ${company.name}\n` +
    `👤 ${contact.fullName}${contact.position ? ` (${contact.position})` : ""}\n` +
    `📝 ${notePreview}\n\n` +
    `${currentEmoji} Status: <b>${currentLabel}</b>\n` +
    `Muốn cập nhật status?`;

  await ctx.reply(confirmMsg, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}
