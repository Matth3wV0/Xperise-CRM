"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Mail,
  Phone,
  Linkedin,
  Plus,
  X,
  Building2,
  User,
  Calendar,
  FileText,
  RefreshCw,
  MoreHorizontal,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { CONTACT_STATUSES, ACTION_TYPES, PRIORITIES, INDUSTRIES } from "@xperise/shared";

interface ContactDetail {
  id: string;
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  source: string;
  priority: number;
  type: string;
  contactStatus: string;
  emailVerify: string;
  notes: string | null;
  companyId: string;
  assignedToId: string | null;
  createdAt: string;
  company: { id: string; name: string; industry: string };
  assignedTo: { id: string; name: string; email: string } | null;
  actions: {
    id: string;
    type: string;
    status: string;
    note: string | null;
    performedAt: string;
    performedBy: { id: string; name: string };
  }[];
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  NO_CONTACT:     { bg: "bg-zinc-800/60", text: "text-zinc-300", dot: "bg-zinc-500" },
  CONTACT:        { bg: "bg-blue-950/60", text: "text-blue-300", dot: "bg-blue-500" },
  REACHED:        { bg: "bg-amber-950/60", text: "text-amber-300", dot: "bg-amber-500" },
  FOLLOW_UP:      { bg: "bg-orange-950/60", text: "text-orange-300", dot: "bg-orange-500" },
  MEETING_BOOKED: { bg: "bg-violet-950/60", text: "text-violet-300", dot: "bg-violet-500" },
  CONVERTED:      { bg: "bg-emerald-950/60", text: "text-emerald-300", dot: "bg-emerald-500" },
};

const PRIORITY_COLORS = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#6b7280"];

const ACTION_ICONS: Record<string, React.ElementType> = {
  EMAIL_SENT: Mail,
  EMAIL_FOLLOW_UP: Mail,
  LINKEDIN_MESSAGE: Linkedin,
  LINKEDIN_CONNECT: Linkedin,
  PHONE_CALL: Phone,
  MEETING: Calendar,
  NOTE: FileText,
  STATUS_CHANGE: RefreshCw,
  OTHER: MoreHorizontal,
};

const ACTION_COLORS: Record<string, string> = {
  EMAIL_SENT:       "bg-blue-950 text-blue-400 border-blue-800/50",
  EMAIL_FOLLOW_UP:  "bg-blue-950 text-blue-400 border-blue-800/50",
  LINKEDIN_MESSAGE: "bg-sky-950 text-sky-400 border-sky-800/50",
  LINKEDIN_CONNECT: "bg-sky-950 text-sky-400 border-sky-800/50",
  PHONE_CALL:       "bg-emerald-950 text-emerald-400 border-emerald-800/50",
  MEETING:          "bg-violet-950 text-violet-400 border-violet-800/50",
  NOTE:             "bg-zinc-800 text-zinc-400 border-zinc-700/50",
  STATUS_CHANGE:    "bg-amber-950 text-amber-400 border-amber-800/50",
  OTHER:            "bg-zinc-800 text-zinc-400 border-zinc-700/50",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("vi-VN", { day: "2-digit", month: "short" });
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { canEdit } = useAuth();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const [actionForm, setActionForm] = useState({ type: "NOTE", note: "" });
  const [savingAction, setSavingAction] = useState(false);

  const loadContact = useCallback(async () => {
    try {
      const res = await apiGet<{ contact: ContactDetail }>(`/contacts/${id}`);
      setContact(res.contact);
    } catch {
      router.push("/contacts");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadContact();
  }, [loadContact]);

  async function handleAddAction(e: React.FormEvent) {
    e.preventDefault();
    setSavingAction(true);
    try {
      await apiPost(`/contacts/${id}/actions`, {
        type: actionForm.type,
        note: actionForm.note || undefined,
      });
      setActionForm({ type: "NOTE", note: "" });
      setShowAction(false);
      loadContact();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingAction(false);
    }
  }

  if (loading || !contact) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const statusInfo = CONTACT_STATUSES.find((s) => s.value === contact.contactStatus);
  const priorityColor = PRIORITY_COLORS[contact.priority] ?? "#6b7280";
  const industryLabel = INDUSTRIES.find((i) => i.value === contact.company.industry)?.label ?? contact.company.industry;
  const statusStyle = STATUS_STYLES[contact.contactStatus] ?? STATUS_STYLES.NO_CONTACT;

  return (
    <div className="space-y-5">
      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          onClick={() => router.push("/contacts")}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Contacts
        </button>
        <span>/</span>
        <span className="text-foreground font-medium truncate">{contact.fullName}</span>
      </div>

      {/* Header Card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white"
            style={{ backgroundColor: priorityColor }}
          >
            {contact.fullName.charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{contact.fullName}</h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium border ${statusStyle.bg} ${statusStyle.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                {statusInfo?.label ?? contact.contactStatus}
              </span>
              <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {contact.type}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {contact.position && <span>{contact.position}</span>}
              {contact.position && <span>·</span>}
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {contact.company.name}
              </span>
              <span>·</span>
              <span>{industryLabel}</span>
            </div>

            {/* Quick contact links */}
            <div className="mt-3 flex flex-wrap gap-2">
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                >
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {contact.phone}
                </a>
              )}
              {contact.linkedin && (
                <a
                  href={contact.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                >
                  <Linkedin className="h-3.5 w-3.5 text-muted-foreground" />
                  LinkedIn
                </a>
              )}
            </div>
          </div>

          {/* Edit button */}
          {canEdit && (
            <button
              onClick={() => setShowEdit(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent transition-colors shrink-0"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Body: 2-column layout */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: Details */}
        <div className="space-y-4">
          {/* Meta details */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Priority</span>
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: priorityColor }}
                >
                  {contact.priority}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="font-medium">{contact.source}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{contact.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email verify</span>
                <span className="font-medium">{contact.emailVerify}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">PIC</span>
                <span className="font-medium">
                  {contact.assignedTo ? (
                    <span className="flex items-center gap-1.5">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold ring-1 ring-border">
                        {contact.assignedTo.name.charAt(0).toUpperCase()}
                      </div>
                      {contact.assignedTo.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">Unassigned</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {new Date(contact.createdAt).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Company info */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Company</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary border border-border">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold">{contact.company.name}</p>
                <p className="text-xs text-muted-foreground">{industryLabel}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {contact.notes && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{contact.notes}</p>
            </div>
          )}
        </div>

        {/* Right: Activity timeline */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold">Activity Timeline</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {contact.actions.length} recorded actions
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={() => setShowAction(!showAction)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  {showAction ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {showAction ? "Cancel" : "Log Action"}
                </button>
              )}
            </div>

            {/* Add action form */}
            {showAction && (
              <div className="border-b border-border bg-secondary/30 px-5 py-4">
                <form onSubmit={handleAddAction} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Action Type</label>
                      <select
                        className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary"
                        value={actionForm.type}
                        onChange={(e) => setActionForm({ ...actionForm, type: e.target.value })}
                      >
                        {ACTION_TYPES.map((a) => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
                      <input
                        placeholder="Add a note..."
                        className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary placeholder:text-muted-foreground"
                        value={actionForm.note}
                        onChange={(e) => setActionForm({ ...actionForm, note: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={savingAction}
                      className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {savingAction ? "Saving..." : "Save Action"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAction(false)}
                      className="rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-medium hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Timeline */}
            <div className="p-5">
              {contact.actions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <User className="h-10 w-10 text-muted-foreground/20 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No actions recorded</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Log the first interaction with this contact</p>
                </div>
              ) : (
                <div className="relative space-y-4">
                  {/* Timeline line */}
                  <div className="absolute left-[17px] top-2 bottom-2 w-px bg-border" />

                  {contact.actions.map((action) => {
                    const actionType = ACTION_TYPES.find((a) => a.value === action.type);
                    const Icon = ACTION_ICONS[action.type] ?? MoreHorizontal;
                    const colorClass = ACTION_COLORS[action.type] ?? ACTION_COLORS.OTHER;

                    return (
                      <div key={action.id} className="relative flex items-start gap-4 pl-1">
                        {/* Icon dot */}
                        <div
                          className={`z-10 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border ${colorClass}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 rounded-lg border border-border bg-secondary/30 px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold border ${colorClass}`}>
                                {actionType?.label ?? action.type}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                by <span className="font-medium text-foreground">{action.performedBy.name}</span>
                              </span>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {timeAgo(action.performedAt)}
                            </span>
                          </div>
                          {action.note && (
                            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{action.note}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <ContactFormDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSaved={loadContact}
        editData={contact}
      />
    </div>
  );
}
