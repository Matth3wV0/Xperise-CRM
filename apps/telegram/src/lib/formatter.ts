export const STATUS_LABELS: Record<string, string> = {
  NO_CONTACT: "Chưa liên hệ",
  CONTACT: "Đã có contact",
  REACHED: "Đã tiếp cận",
  FOLLOW_UP: "Follow-up",
  MEETING_BOOKED: "Đã đặt meeting",
  CONVERTED: "Đã convert",
};

export const STATUS_EMOJI: Record<string, string> = {
  NO_CONTACT: "⚪",
  CONTACT: "🟡",
  REACHED: "🟠",
  FOLLOW_UP: "🔵",
  MEETING_BOOKED: "🟢",
  CONVERTED: "✅",
};

export const ACTION_LABELS: Record<string, string> = {
  EMAIL_SENT: "📧 Email gửi",
  EMAIL_FOLLOW_UP: "📧 Email follow-up",
  LINKEDIN_MESSAGE: "💼 LinkedIn msg",
  LINKEDIN_CONNECT: "💼 LinkedIn connect",
  PHONE_CALL: "📞 Gọi điện",
  MEETING: "🤝 Meeting",
  NOTE: "📝 Note",
  STATUS_CHANGE: "🔄 Đổi status",
  OTHER: "📌 Khác",
};

export const COLD_DAYS_THRESHOLD = 7;
export const VERY_COLD_DAYS = 14;

// Statuses that a user can change to (excludes NO_CONTACT)
export const ACTIONABLE_STATUSES = [
  "CONTACT",
  "REACHED",
  "FOLLOW_UP",
  "MEETING_BOOKED",
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

<b>Cập nhật nhanh trong group:</b>
<code>[Tên công ty] Nội dung update...</code>

<i>Ví dụ:</i>
<code>[ABC Corp] Đã gọi điện, họ đang review proposal, follow up thứ 2 tuần sau</code>`;
