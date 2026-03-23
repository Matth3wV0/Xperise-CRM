import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "@xperise/database";
import { parseFindQuery, searchApolloLeads, type ApolloPersonResult } from "../lib/apollo.js";

/**
 * /find <criteria>
 * Search Apollo.io for leads and display top results.
 * ADMIN and MANAGER only.
 *
 * Examples:
 *   /find CFO Banking Vietnam
 *   /find CHRO FMCG
 *   /find Head of Finance Manufacturing
 */
export async function handleFind(ctx: Context) {
  const telegramId = String(ctx.from?.id);
  const binding = await prisma.telegramBinding.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  if (!binding) {
    await ctx.reply("Bạn chưa link tài khoản. Dùng /start để xem hướng dẫn.");
    return;
  }

  if (!["ADMIN", "MANAGER", "BD_STAFF"].includes(binding.user.role)) {
    await ctx.reply("⛔ Bạn không có quyền tìm kiếm leads.");
    return;
  }

  const query = (ctx.match as string)?.trim();
  if (!query) {
    await ctx.reply(
      "<b>/find — Tìm leads trên Apollo.io</b>\n\n" +
        "Cú pháp: <code>/find [title] [industry] [location]</code>\n\n" +
        "Ví dụ:\n" +
        "<code>/find CFO Banking Vietnam</code>\n" +
        "<code>/find CHRO FMCG</code>\n" +
        "<code>/find Head of Finance Manufacturing</code>\n\n" +
        "Industry: bank, fmcg, media, pharma, manufacturing\n" +
        "Location: vietnam (mặc định), singapore, thailand",
      { parse_mode: "HTML" }
    );
    return;
  }

  const searchMsg = await ctx.reply(
    `🔍 Đang tìm kiếm "<b>${query}</b>" trên Apollo.io...`,
    { parse_mode: "HTML" }
  );

  try {
    const parsed = parseFindQuery(query);
    const result = await searchApolloLeads(parsed);

    if (result.people.length === 0) {
      await ctx.api.editMessageText(
        searchMsg.chat.id,
        searchMsg.message_id,
        `❌ Không tìm thấy kết quả cho "<b>${query}</b>".\n\nThử điều chỉnh từ khóa tìm kiếm.`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // Format filter summary
    const filterParts: string[] = [];
    if (parsed.personTitles.length > 0) filterParts.push(`Title: ${parsed.personTitles.join(", ")}`);
    if (parsed.organizationIndustries.length > 0) filterParts.push(`Industry: ${parsed.organizationIndustries.join(", ")}`);
    if (parsed.personLocations.length > 0) filterParts.push(`Location: ${parsed.personLocations.join(", ")}`);

    let msg =
      `🔍 <b>Kết quả Apollo: "${query}"</b>\n` +
      `<i>${filterParts.join(" | ")}</i>\n` +
      `Tìm thấy ${result.total.toLocaleString()} kết quả, hiển thị ${result.people.length}:\n` +
      `━━━━━━━━━━━━━━━━━━\n\n`;

    for (let i = 0; i < result.people.length; i++) {
      const p = result.people[i];
      msg += formatPersonEntry(i + 1, p);
    }

    msg += `\nDùng <code>/import_apollo</code> + ID để import vào CRM.\nHoặc nhấn nút bên dưới để import toàn bộ.`;

    // Build inline keyboard: import each person individually
    const keyboard = new InlineKeyboard();
    for (let i = 0; i < Math.min(result.people.length, 5); i++) {
      const p = result.people[i];
      const label = `${i + 1}. ${p.first_name} — ${p.organization?.name ?? "?"}`;
      keyboard.text(label, `fi:${p.id}`).row();
    }

    await ctx.api.editMessageText(
      searchMsg.chat.id,
      searchMsg.message_id,
      msg,
      { parse_mode: "HTML", reply_markup: keyboard }
    );

    // Store search results in a temp cache so the callback can access them
    // (Telegram callback only gets the Apollo ID, not full data)
    // We pass key data in the message itself since there's no session store
    // Full import handled via /import command or web UI
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Lỗi không xác định";
    await ctx.api.editMessageText(
      searchMsg.chat.id,
      searchMsg.message_id,
      `❌ Lỗi khi gọi Apollo: ${errMsg}`,
      { parse_mode: "HTML" }
    );
  }
}

function formatPersonEntry(index: number, p: ApolloPersonResult): string {
  const org = p.organization;
  let entry = `<b>${index}. ${p.name}</b>\n`;
  if (p.title) entry += `   ${p.title}\n`;
  if (org?.name) {
    entry += `   🏢 ${org.name}`;
    if (org.industry) entry += ` (${org.industry})`;
    if (org.estimated_num_employees) entry += ` · ${org.estimated_num_employees.toLocaleString()} emp`;
    entry += "\n";
  }
  if (p.email) {
    const verifyIcon = p.email_status === "verified" || p.email_status === "valid" ? "✓" : "?";
    entry += `   📧 ${p.email} ${verifyIcon}\n`;
  } else {
    entry += `   📧 Email ẩn (cần enrich)\n`;
  }
  if (p.linkedin_url) entry += `   💼 LinkedIn: có\n`;
  entry += "\n";
  return entry;
}
