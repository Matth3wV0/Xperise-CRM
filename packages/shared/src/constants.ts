// ─── Contact Status Pipeline (matches Sales_Process_Architecture_v3) ──

export const CONTACT_STATUSES = [
  { value: "NO_CONTACT", label: "0. Target List", labelVi: "0. Danh sách mục tiêu", probability: 0 },
  { value: "CONTACT", label: "1. Contact Found", labelVi: "1. Đã tìm contact", probability: 0.05 },
  { value: "REACHED", label: "2. First Touch", labelVi: "2. Đã tiếp cận", probability: 0.1 },
  { value: "FOLLOW_UP", label: "3. Engaged", labelVi: "3. Đã phản hồi", probability: 0.3 },
  { value: "MEETING_BOOKED", label: "4. Meeting Booked", labelVi: "4. Đã đặt meeting", probability: 0.5 },
  { value: "MET", label: "5. Met", labelVi: "5. Đã meeting", probability: 0.7 },
  { value: "NURTURE", label: "6. Nurture", labelVi: "6. Nuôi dưỡng", probability: 0.1 },
  { value: "LOST", label: "6. Lost", labelVi: "6. Đã mất", probability: 0 },
  { value: "CONVERTED", label: "7. Converted", labelVi: "7. Chuyển đổi", probability: 1.0 },
] as const;

// ─── Stage SLA Configuration ──────────────────────────────
// From Sales_Process_Architecture_v3 Section 2.4

export const STAGE_SLA: Record<string, {
  days: number | null;
  label: string;
  escalationDays: number | null;
  escalationLabel: string;
}> = {
  NO_CONTACT:     { days: 7,    label: "7 ngày",        escalationDays: 14,   escalationLabel: "Highlight trên dashboard" },
  CONTACT:        { days: 5,    label: "5 ngày",        escalationDays: 10,   escalationLabel: "Cảnh báo bỏ quên" },
  REACHED:        { days: 3,    label: "3 ngày/bước",   escalationDays: 14,   escalationLabel: "Đổi channel hoặc contact" },
  FOLLOW_UP:      { days: 1,    label: "24 giờ",        escalationDays: 2,    escalationLabel: "Cảnh báo đỏ" },
  MEETING_BOOKED: { days: null, label: "Tới ngày meeting", escalationDays: null, escalationLabel: "Reschedule > 2 lần → flag" },
  MET:            { days: 7,    label: "7 ngày",        escalationDays: 14,   escalationLabel: "Deal cooling" },
  NURTURE:        { days: 30,   label: "30 ngày",       escalationDays: 90,   escalationLabel: "Check-in lần nữa" },
  LOST:           { days: null, label: "N/A",           escalationDays: null, escalationLabel: "N/A" },
  CONVERTED:      { days: null, label: "N/A",           escalationDays: null, escalationLabel: "N/A" },
};

// Active stages that participate in SLA tracking (exclude terminal states)
export const SLA_TRACKED_STATUSES = [
  "NO_CONTACT", "CONTACT", "REACHED", "FOLLOW_UP", "MEETING_BOOKED", "MET",
] as const;

// Statuses considered "active" in pipeline (not terminal)
export const ACTIVE_STATUSES = [
  "CONTACT", "REACHED", "FOLLOW_UP", "MEETING_BOOKED", "MET",
] as const;

// Terminal/inactive statuses
export const TERMINAL_STATUSES = ["NURTURE", "LOST", "CONVERTED"] as const;

// ─── Deal Stages ────────────────────────────────────────

export const DEAL_STAGES = [
  { value: "NEW_CONVERTED", label: "0. New Converted", labelVi: "0. Mới chuyển đổi", winRate: 0 },
  { value: "MEETING", label: "2. Meeting (Presentation)", labelVi: "2. Họp (Trình bày)", winRate: 0.1 },
  { value: "PROPOSAL", label: "3. Proposal", labelVi: "3. Đề xuất", winRate: 0.25 },
  { value: "PILOT_POC", label: "4. Pilot / PoC", labelVi: "4. Thử nghiệm", winRate: 0.67 },
  { value: "NEGOTIATION", label: "5. Negotiation", labelVi: "5. Đàm phán", winRate: 0.9 },
  { value: "CLOSED_WON", label: "6. Closed Won", labelVi: "6. Thắng", winRate: 1.0 },
  { value: "CLOSED_LOST", label: "7. Closed Lost", labelVi: "7. Thua", winRate: 0 },
] as const;

// ─── Industries ─────────────────────────────────────────

export const INDUSTRIES = [
  { value: "BANK", label: "Banking", labelVi: "Ngân hàng" },
  { value: "FMCG", label: "FMCG", labelVi: "FMCG" },
  { value: "MEDIA", label: "Media", labelVi: "Truyền thông" },
  { value: "CONGLOMERATE", label: "Conglomerate", labelVi: "Tập đoàn" },
  { value: "TECH_DURABLE", label: "Tech & Durable", labelVi: "Công nghệ" },
  { value: "PHARMA_HEALTHCARE", label: "Pharma & Healthcare", labelVi: "Dược & Y tế" },
  { value: "MANUFACTURING", label: "Manufacturing", labelVi: "Sản xuất" },
  { value: "OTHERS", label: "Others", labelVi: "Khác" },
] as const;

// ─── Priorities ─────────────────────────────────────────

export const PRIORITIES = [
  { value: 1, label: "Priority 1", labelVi: "Ưu tiên 1", color: "#ef4444" },
  { value: 2, label: "Priority 2", labelVi: "Ưu tiên 2", color: "#f97316" },
  { value: 3, label: "Priority 3", labelVi: "Ưu tiên 3", color: "#eab308" },
  { value: 4, label: "Priority 4", labelVi: "Ưu tiên 4", color: "#22c55e" },
  { value: 5, label: "Priority 5", labelVi: "Ưu tiên 5", color: "#6b7280" },
] as const;

// ─── Contact Sources ────────────────────────────────────

export const CONTACT_SOURCES = [
  { value: "CURRENT_XPERISE", label: "Current Xperise", labelVi: "Khách hàng Xperise" },
  { value: "DESK_RESEARCH", label: "Desk Research", labelVi: "Nghiên cứu" },
  { value: "PERSONAL_REFERRAL", label: "Personal Referral", labelVi: "Giới thiệu" },
  { value: "APOLLO", label: "Apollo.io", labelVi: "Apollo.io" },
  { value: "OTHER", label: "Other", labelVi: "Khác" },
] as const;

// ─── Contact Types ──────────────────────────────────────

export const CONTACT_TYPES = [
  { value: "SNIPING", label: "Sniping", labelVi: "Sniping" },
  { value: "HUNTING", label: "Hunting", labelVi: "Hunting" },
] as const;

// ─── Action Types ───────────────────────────────────────

export const ACTION_TYPES = [
  { value: "EMAIL_SENT", label: "Email Sent", labelVi: "Đã gửi email" },
  { value: "EMAIL_FOLLOW_UP", label: "Email Follow-up", labelVi: "Follow-up email" },
  { value: "LINKEDIN_MESSAGE", label: "LinkedIn Message", labelVi: "Tin nhắn LinkedIn" },
  { value: "LINKEDIN_CONNECT", label: "LinkedIn Connect", labelVi: "Kết nối LinkedIn" },
  { value: "LINKEDIN_ACCEPTED", label: "LinkedIn Accepted", labelVi: "LinkedIn đã accept" },
  { value: "PHONE_CALL", label: "Phone Call", labelVi: "Gọi điện" },
  { value: "MEETING", label: "Meeting", labelVi: "Họp" },
  { value: "NOTE", label: "Note", labelVi: "Ghi chú" },
  { value: "STATUS_CHANGE", label: "Status Change", labelVi: "Đổi trạng thái" },
  { value: "OTHER", label: "Other", labelVi: "Khác" },
] as const;

// ─── Roles ──────────────────────────────────────────────

export const ROLES = [
  { value: "ADMIN", label: "Admin", labelVi: "Quản trị viên" },
  { value: "MANAGER", label: "Manager", labelVi: "Quản lý" },
  { value: "BD_STAFF", label: "BD Staff", labelVi: "Nhân viên BD" },
  { value: "VIEWER", label: "Viewer", labelVi: "Người xem" },
] as const;
