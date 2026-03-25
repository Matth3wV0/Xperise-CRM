import type { Context } from "grammy";
import { prisma } from "@xperise/database";
import { rp } from "../lib/rp.js";
import { findCompanyByName } from "../lib/fuzzy.js";
import {
  STATUS_LABELS,
  STATUS_EMOJI,
  ACTION_LABELS,
  formatDate,
  daysSince,
  COLD_DAYS_THRESHOLD,
} from "../lib/formatter.js";

export async function handleStatus(ctx: Context) {
  const query = (ctx.match as string)?.trim();
  if (!query) {
    await ctx.reply(
      "Vui lòng nhập tên công ty:\n<code>/status ABC Corp</code>",
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  const company = await findCompanyByName(query);
  if (!company) {
    await ctx.reply(
      `❌ Không tìm thấy công ty: <b>${query}</b>\n\nThử tên khác hoặc kiểm tra trong web app.`,
      { ...rp(ctx), parse_mode: "HTML" }
    );
    return;
  }

  const [contacts, pipeline] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId: company.id },
      include: {
        assignedTo: { select: { name: true } },
        actions: {
          take: 1,
          orderBy: { performedAt: "desc" },
          include: { performedBy: { select: { name: true } } },
        },
      },
      orderBy: { lastTouchedAt: "desc" },
      take: 5,
    }),
    prisma.pipeline.findFirst({
      where: { companyId: company.id },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  let msg = `🏢 <b>${company.name}</b>\n`;
  msg += `📂 Ngành: ${company.industry}\n`;

  if (pipeline) {
    msg += `💼 Deal: <b>${pipeline.dealStage}</b>`;
    if (pipeline.totalRevenue > 0n) {
      msg += ` | 💰 ${Number(pipeline.totalRevenue).toLocaleString("vi-VN")}đ`;
    }
    msg += "\n";
  }

  if (contacts.length === 0) {
    msg += "\n<i>Chưa có contacts nào.</i>";
  } else {
    msg += `\n<b>Contacts (${contacts.length}):</b>\n`;
    for (const c of contacts) {
      const emoji = STATUS_EMOJI[c.contactStatus] ?? "⚪";
      const label = STATUS_LABELS[c.contactStatus] ?? c.contactStatus;
      const pic = c.assignedTo?.name ?? "Chưa phân công";
      const days = daysSince(c.lastTouchedAt);
      const coldFlag = days >= COLD_DAYS_THRESHOLD ? ` 🥶 ${days}d` : "";

      msg += `\n${emoji} <b>${c.fullName}</b>${c.position ? ` — ${c.position}` : ""}\n`;
      msg += `   ${label} | ${pic}${coldFlag}\n`;

      if (c.actions[0]) {
        const a = c.actions[0];
        const actionLabel = ACTION_LABELS[a.type] ?? a.type;
        const notePreview = a.note ? a.note.substring(0, 60) + (a.note.length > 60 ? "..." : "") : "";
        const dateStr = formatDate(new Date(a.performedAt));
        msg += `   ↳ ${actionLabel} (${dateStr}): ${notePreview}\n`;
      }
    }
  }

  await ctx.reply(msg, { ...rp(ctx), parse_mode: "HTML" });
}
