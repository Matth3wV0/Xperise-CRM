export const STATUS_LABELS: Record<string, string> = {
  NO_CONTACT: "Target List",
  CONTACT: "Contact Found",
  REACHED: "First Touch",
  FOLLOW_UP: "Engaged",
  MEETING_BOOKED: "Meeting Booked",
  MET: "Met",
  NURTURE: "Nurture",
  LOST: "Lost",
  CONVERTED: "Converted",
};

export const STATUS_EMOJI: Record<string, string> = {
  NO_CONTACT: "⚪",
  CONTACT: "🟡",
  REACHED: "🟠",
  FOLLOW_UP: "🔵",
  MEETING_BOOKED: "🟣",
  MET: "🟢",
  NURTURE: "💤",
  LOST: "❌",
  CONVERTED: "✅",
};

export const ACTION_LABELS: Record<string, string> = {
  EMAIL_SENT: "📧 Email gửi",
  EMAIL_FOLLOW_UP: "📧 Email follow-up",
  LINKEDIN_MESSAGE: "💼 LinkedIn msg",
  LINKEDIN_CONNECT: "💼 LinkedIn connect",
  LINKEDIN_ACCEPTED: "💼 LinkedIn accepted",
  PHONE_CALL: "📞 Gọi điện",
  MEETING: "🤝 Meeting",
  NOTE: "📝 Note",
  STATUS_CHANGE: "🔄 Đổi status",
  OTHER: "📌 Khác",
};

export const COLD_DAYS_THRESHOLD = 7;
export const VERY_COLD_DAYS = 14;

// Statuses that a user can transition TO via inline keyboard
export const ACTIONABLE_STATUSES = [
  "CONTACT",
  "REACHED",
  "FOLLOW_UP",
  "MEETING_BOOKED",
  "MET",
  "NURTURE",
  "LOST",
  "CONVERTED",
] as const;

export function formatDate(date: Date): string {
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export function daysSince(date: Date | null | undefined): number {
  if (!date) return 999;
  const diff = Date.now() - new Date(date).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export const HELP_TEXT = `<b>Xperise BD Bot</b> - Trợ lý Sales Team

<b>Commands:</b>
/start - Thông tin và hướng dẫn
/bind &lt;code&gt; - Link tài khoản (chat riêng)
/status &lt;tên công ty&gt; - Xem status công ty
/mine - Danh sách contacts của bạn
/cold - Leads nguội (> ${COLD_DAYS_THRESHOLD} ngày chưa touch)
/help - Xem hướng dẫn

<b>Apollo Lead Search:</b>
/find &lt;title&gt; [industry] [location] - Tìm leads mới

<i>Ví dụ:</i>
<code>/find CFO Banking Vietnam</code>
<code>/find CHRO FMCG</code>

<b>Campaign:</b>
/campaign - Danh sách campaigns
/campaign &lt;tên&gt; - Chi tiết + stats campaign
/approve &lt;campaignId&gt; - Duyệt tất cả emails (ADMIN/MANAGER)
/reject &lt;campaignId&gt; [lý do] - Từ chối emails (ADMIN/MANAGER)

<b>AI Assistant:</b>
/ai &lt;câu hỏi&gt; - Hỏi AI về pipeline, leads, performance
/brief - Daily briefing (follow-ups, stale deals, next steps)
/draft &lt;tên contact&gt; - AI soạn email outreach

<i>Ví dụ:</i>
<code>/ai Lead nào cần chăm sóc gấp?</code>
<code>/ai Pipeline Q1 status?</code>
<code>/draft Nguyen Van A</code>
<code>/draft Nguyen Van A focus on digital transformation</code>

<b>Cập nhật nhanh trong group:</b>
<code>[Tên công ty] Nội dung update...</code>

<i>Ví dụ:</i>
<code>[ABC Corp] Đã gọi điện, họ đang review proposal, follow up thứ 2 tuần sau</code>`;
