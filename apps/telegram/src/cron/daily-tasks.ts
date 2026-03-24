import type { Bot, Context } from "grammy";
import { prisma } from "@xperise/database";
import { STATUS_LABELS, STATUS_EMOJI, formatDate } from "../lib/formatter.js";
import { getActiveGroupChatId } from "../lib/active-group.js";

const SLA_DAYS: Record<string, number> = {
  NO_CONTACT: 7,
  CONTACT: 5,
  REACHED: 3,
  FOLLOW_UP: 1,
  MEETING_BOOKED: 999,
  MET: 7,
};

interface TaskItem {
  priority: "urgent" | "important" | "normal";
  contactId: string;
  contactName: string;
  position: string | null;
  companyName: string;
  stage: string;
  daysInStage: number;
  daysSinceTouch: number;
  signal: string;
  action: string;
  assignedTo: string | null;
}

export async function sendDailyTaskList(bot: Bot<Context>) {
  const groupChatId = await getActiveGroupChatId();
  if (!groupChatId) return;

  const now = Date.now();

  // Fetch all active contacts (not terminal states)
  const contacts = await prisma.contact.findMany({
    where: {
      contactStatus: { notIn: ["CONVERTED", "LOST"] as any[] },
    },
    include: {
      company: { select: { name: true, industry: true } },
      assignedTo: { select: { name: true } },
      actions: {
        orderBy: { performedAt: "desc" },
        take: 1,
        select: { type: true, performedAt: true },
      },
      emailLogs: {
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { openedAt: true, repliedAt: true },
      },
    },
    orderBy: { lastTouchedAt: "asc" },
  });

  const tasks: TaskItem[] = [];

  for (const c of contacts) {
    const slaDays = SLA_DAYS[c.contactStatus] ?? null;
    const stageDate = c.stageChangedAt ?? c.createdAt;
    const daysInStage = Math.floor((now - new Date(stageDate).getTime()) / 86400000);
    const daysSinceTouch = c.lastTouchedAt
      ? Math.floor((now - new Date(c.lastTouchedAt).getTime()) / 86400000)
      : 999;

    const slaOverdue = slaDays != null && slaDays < 999 && daysInStage > slaDays;
    const emailOpened = c.emailLogs[0]?.openedAt != null;

    // Determine priority + signal + action
    let priority: "urgent" | "important" | "normal";
    let signal: string;
    let action: string;

    if (c.contactStatus === "FOLLOW_UP" && daysSinceTouch >= 1) {
      // Lead is engaged but nobody responded — URGENT
      priority = "urgent";
      signal = `Reply ${daysSinceTouch === 999 ? "chưa ai respond" : `${daysSinceTouch}d trước, chưa respond`}`;
      action = "Reply + đề xuất meeting";
    } else if (c.contactStatus === "MEETING_BOOKED") {
      // Check if meeting is today/tomorrow (approximate via lastTouchedAt)
      priority = daysInStage <= 1 ? "urgent" : "important";
      signal = `Meeting đã book ${daysInStage}d trước`;
      action = daysInStage <= 1 ? "Review meeting brief" : "Confirm meeting";
    } else if (slaOverdue && c.contactStatus === "REACHED") {
      // First touch sent, no reply, overdue
      priority = "important";
      signal = emailOpened
        ? `Email opened nhưng chưa reply (${daysSinceTouch}d)`
        : `${daysSinceTouch}d chưa phản hồi`;
      action = daysSinceTouch > 7 ? "Thử channel khác" : "Gửi follow up";
    } else if (slaOverdue) {
      priority = "important";
      signal = `Quá SLA ${slaDays}d (đang ${daysInStage}d ở stage)`;
      action = c.contactStatus === "NO_CONTACT" ? "Tìm contact qua Apollo"
        : c.contactStatus === "CONTACT" ? "Bắt đầu tiếp cận"
        : c.contactStatus === "MET" ? "Follow up sau meeting"
        : "Follow up";
    } else if (c.contactStatus === "NURTURE" && daysSinceTouch >= 30) {
      // Nurture check-in
      priority = "normal";
      signal = `Nurture ${daysSinceTouch}d, đến hạn check-in`;
      action = "Gửi check-in message";
    } else if (daysSinceTouch > 7 && !["NO_CONTACT", "NURTURE"].includes(c.contactStatus)) {
      priority = "normal";
      signal = `${daysSinceTouch}d chưa touch`;
      action = "Follow up";
    } else {
      continue; // No task needed
    }

    tasks.push({
      priority,
      contactId: c.id,
      contactName: c.fullName,
      position: c.position,
      companyName: c.company.name,
      stage: c.contactStatus,
      daysInStage,
      daysSinceTouch,
      signal,
      action,
      assignedTo: c.assignedTo?.name ?? null,
    });
  }

  if (tasks.length === 0) return;

  // Sort: urgent → important → normal
  const urgencyOrder = { urgent: 0, important: 1, normal: 2 };
  tasks.sort((a, b) => {
    const uDiff = urgencyOrder[a.priority] - urgencyOrder[b.priority];
    if (uDiff !== 0) return uDiff;
    return b.daysSinceTouch - a.daysSinceTouch;
  });

  const urgentCount = tasks.filter((t) => t.priority === "urgent").length;
  const importantCount = tasks.filter((t) => t.priority === "important").length;
  const normalCount = tasks.filter((t) => t.priority === "normal").length;

  const today = new Date().toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  let msg = `📋 <b>DAILY SALES PLAN — ${today}</b>\n`;
  msg += `Tổng: ${tasks.length} tasks`;
  if (urgentCount) msg += ` | 🔴 Urgent: ${urgentCount}`;
  if (importantCount) msg += ` | 🟡 Important: ${importantCount}`;
  if (normalCount) msg += ` | 🟢 Normal: ${normalCount}`;
  msg += "\n\n";

  let idx = 1;

  // Urgent
  const urgent = tasks.filter((t) => t.priority === "urgent").slice(0, 5);
  if (urgent.length > 0) {
    msg += "🔴 <b>URGENT — Phản hồi ngay:</b>\n\n";
    for (const t of urgent) {
      const emoji = STATUS_EMOJI[t.stage] ?? "⚪";
      const label = STATUS_LABELS[t.stage] ?? t.stage;
      msg += `  ${idx}. ${emoji} [${label}] <b>${t.companyName}</b>\n`;
      msg += `     ${t.contactName}${t.position ? ` — ${t.position}` : ""}\n`;
      msg += `     ${t.signal}\n`;
      msg += `     → <i>${t.action}</i>\n`;
      if (t.assignedTo) msg += `     👤 ${t.assignedTo}\n`;
      msg += "\n";
      idx++;
    }
  }

  // Important
  const important = tasks.filter((t) => t.priority === "important").slice(0, 7);
  if (important.length > 0) {
    msg += "🟡 <b>IMPORTANT — Follow up theo schedule:</b>\n\n";
    for (const t of important) {
      const emoji = STATUS_EMOJI[t.stage] ?? "⚪";
      const label = STATUS_LABELS[t.stage] ?? t.stage;
      msg += `  ${idx}. ${emoji} [${label}] <b>${t.companyName}</b>\n`;
      msg += `     ${t.contactName} — ${t.signal}\n`;
      msg += `     → <i>${t.action}</i>\n`;
      if (t.assignedTo) msg += `     👤 ${t.assignedTo}\n`;
      msg += "\n";
      idx++;
    }
  }

  // Normal
  const normal = tasks.filter((t) => t.priority === "normal").slice(0, 5);
  if (normal.length > 0) {
    msg += "🟢 <b>NORMAL — Research & Expand:</b>\n\n";
    for (const t of normal) {
      const emoji = STATUS_EMOJI[t.stage] ?? "⚪";
      const label = STATUS_LABELS[t.stage] ?? t.stage;
      msg += `  ${idx}. ${emoji} [${label}] <b>${t.companyName}</b> — ${t.contactName}\n`;
      msg += `     → <i>${t.action}</i>\n`;
      msg += "\n";
      idx++;
    }
  }

  msg += `<i>Reply với <code>[Tên công ty] update</code> để cập nhật.</i>`;

  // Telegram has 4096 char limit
  if (msg.length > 4000) {
    msg = msg.substring(0, 3997) + "...";
  }

  try {
    await bot.api.sendMessage(groupChatId, msg, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Failed to send daily task list:", err);
  }
}
