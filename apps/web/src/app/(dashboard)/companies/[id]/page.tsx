"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Users,
  Mail,
  Phone,
  Linkedin,
  Globe,
  Calendar,
  FileText,
  TrendingUp,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { CONTACT_STATUSES, INDUSTRIES, STAGE_SLA } from "@xperise/shared";

// --- Types ---

interface ContactItem {
  id: string;
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  contactStatus: string;
  priority: number;
  lastTouchedAt: string | null;
  stageChangedAt: string | null;
  assignedTo: { id: string; name: string } | null;
}

interface PipelineItem {
  id: string;
  dealStage: string;
  totalRevenue: string;
  probability: number;
  notes: string | null;
  pic: { id: string; name: string } | null;
}

interface ActionItem {
  id: string;
  type: string;
  note: string | null;
  performedAt: string;
  contact: { id: string; fullName: string };
  performedBy: { id: string; name: string };
}

interface EmailItem {
  id: string;
  subject: string;
  status: string;
  sentAt: string;
  openedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
  contactId: string;
  contact: { fullName: string };
}

interface CompanyProfile {
  id: string;
  name: string;
  industry: string;
  phone: string | null;
  country: string | null;
  size: string | null;
  employeeCount: string | null;
  annualSpend: string | null;
  fitScore: number | null;
  primaryUseCase: string | null;
  website: string | null;
  digitalMaturity: string | null;
  hqLocation: string | null;
  tags: string[];
  notes: string | null;
  contacts: ContactItem[];
  pipelines: PipelineItem[];
}

interface ProfileData {
  company: CompanyProfile;
  effectiveStage: string;
  daysInStage: number;
  recentActions: ActionItem[];
  emailLogs: EmailItem[];
}

// --- Style maps ---

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  NO_CONTACT:     { bg: "bg-zinc-800/60", text: "text-zinc-300", dot: "bg-zinc-500" },
  CONTACT:        { bg: "bg-blue-950/60", text: "text-blue-300", dot: "bg-blue-500" },
  REACHED:        { bg: "bg-amber-950/60", text: "text-amber-300", dot: "bg-amber-500" },
  FOLLOW_UP:      { bg: "bg-orange-950/60", text: "text-orange-300", dot: "bg-orange-500" },
  MEETING_BOOKED: { bg: "bg-violet-950/60", text: "text-violet-300", dot: "bg-violet-500" },
  MET:            { bg: "bg-green-950/60", text: "text-green-300", dot: "bg-green-500" },
  NURTURE:        { bg: "bg-sky-950/60", text: "text-sky-300", dot: "bg-sky-500" },
  LOST:           { bg: "bg-red-950/60", text: "text-red-300", dot: "bg-red-500" },
  CONVERTED:      { bg: "bg-emerald-950/60", text: "text-emerald-300", dot: "bg-emerald-500" },
};

const FIT_COLORS = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];

const ACTION_ICONS: Record<string, string> = {
  EMAIL_SENT: "📧", EMAIL_FOLLOW_UP: "📧", LINKEDIN_MESSAGE: "💼",
  LINKEDIN_CONNECT: "💼", LINKEDIN_ACCEPTED: "💼", PHONE_CALL: "📞",
  MEETING: "🤝", NOTE: "📝", STATUS_CHANGE: "🔄", OTHER: "📌",
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

function daysSince(date: string | null): number {
  if (!date) return 999;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

// --- Component ---

export default function CompanyProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<ProfileData>(`/companies/${id}`);
      setData(res);
    } catch {
      router.push("/companies");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const { company, effectiveStage, daysInStage, recentActions, emailLogs } = data;
  const stageInfo = CONTACT_STATUSES.find((s) => s.value === effectiveStage);
  const stageStyle = STATUS_STYLES[effectiveStage] ?? STATUS_STYLES.NO_CONTACT;
  const industryLabel = INDUSTRIES.find((i) => i.value === company.industry)?.label ?? company.industry;
  const sla = STAGE_SLA[effectiveStage];
  const slaOverdue = sla?.days != null && daysInStage > sla.days;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => router.push("/companies")} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Companies
        </button>
        <span>/</span>
        <span className="text-foreground font-medium truncate">{company.name}</span>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl font-bold text-primary">
            {company.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{company.name}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium border ${stageStyle.bg} ${stageStyle.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${stageStyle.dot}`} />
                {stageInfo?.label ?? effectiveStage}
              </span>
              {company.fitScore && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium">
                  Fit: <span className="font-bold" style={{ color: FIT_COLORS[company.fitScore] }}>{company.fitScore}/5</span>
                </span>
              )}
              <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {daysInStage}d in stage
                {slaOverdue && <AlertTriangle className="inline h-3 w-3 ml-1 text-red-400" />}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{industryLabel}</span>
              {company.employeeCount && <><span>·</span><span>{company.employeeCount} NV</span></>}
              {company.hqLocation && <><span>·</span><span>{company.hqLocation}</span></>}
              {company.digitalMaturity && <><span>·</span><span>Digital: {company.digitalMaturity}</span></>}
            </div>
            {company.website && (
              <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Globe className="h-3.5 w-3.5" /> {company.website}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Body: 3-column */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: Company Info + Pipeline */}
        <div className="space-y-4">
          {/* Company details */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Company Info</h3>
            <div className="space-y-2.5 text-sm">
              {company.annualSpend && (
                <div className="flex justify-between"><span className="text-muted-foreground">Annual Spend</span><span className="font-medium">{company.annualSpend}</span></div>
              )}
              {company.primaryUseCase && (
                <div className="flex justify-between"><span className="text-muted-foreground">Use Case</span><span className="font-medium">{company.primaryUseCase}</span></div>
              )}
              {company.size && (
                <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span className="font-medium">{company.size}</span></div>
              )}
              {company.phone && (
                <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-medium">{company.phone}</span></div>
              )}
              {sla && sla.days != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SLA</span>
                  <span className={`font-medium ${slaOverdue ? "text-red-400" : "text-green-400"}`}>
                    {sla.label} {slaOverdue ? `(quá ${daysInStage - sla.days}d)` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {company.notes && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{company.notes}</p>
            </div>
          )}

          {/* Pipeline deals */}
          {company.pipelines.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                <TrendingUp className="inline h-3.5 w-3.5 mr-1" /> Pipeline ({company.pipelines.length})
              </h3>
              <div className="space-y-2">
                {company.pipelines.map((p) => (
                  <div key={p.id} className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{p.dealStage.replace(/_/g, " ")}</span>
                      <span className="font-mono text-xs">{Number(p.totalRevenue).toLocaleString("vi-VN")}d</span>
                    </div>
                    {p.pic && <p className="text-xs text-muted-foreground mt-0.5">PIC: {p.pic.name}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Middle: Stakeholders */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              <Users className="inline h-3.5 w-3.5 mr-1" /> Stakeholders ({company.contacts.length})
            </h3>
            {company.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground/60 text-center py-4">No contacts found</p>
            ) : (
              <div className="space-y-3">
                {company.contacts.map((c) => {
                  const cStyle = STATUS_STYLES[c.contactStatus] ?? STATUS_STYLES.NO_CONTACT;
                  const cLabel = CONTACT_STATUSES.find((s) => s.value === c.contactStatus)?.label ?? c.contactStatus;
                  const cold = daysSince(c.lastTouchedAt);
                  return (
                    <button
                      key={c.id}
                      onClick={() => router.push(`/contacts/${c.id}`)}
                      className="w-full text-left rounded-lg border border-border bg-secondary/30 px-3 py-2.5 hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{c.fullName}</span>
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${cStyle.bg} ${cStyle.text}`}>
                          <span className={`h-1 w-1 rounded-full ${cStyle.dot}`} />
                          {cLabel}
                        </span>
                      </div>
                      {c.position && <p className="text-xs text-muted-foreground mt-0.5">{c.position}</p>}
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
                        {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>}
                        {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>}
                        {c.linkedin && <span className="flex items-center gap-1"><Linkedin className="h-3 w-3" /> LinkedIn</span>}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        {c.assignedTo && <span className="text-muted-foreground/70">PIC: {c.assignedTo.name}</span>}
                        <span className={cold > 7 ? "text-red-400" : "text-muted-foreground/50"}>
                          {cold === 999 ? "never touched" : `${cold}d ago`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Activity Timeline */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Clock className="inline h-3.5 w-3.5 mr-1" /> Activity Timeline ({recentActions.length})
              </h3>
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto">
              {recentActions.length === 0 ? (
                <p className="text-sm text-muted-foreground/60 text-center py-6">No activity recorded</p>
              ) : (
                <div className="relative space-y-3">
                  <div className="absolute left-[13px] top-2 bottom-2 w-px bg-border" />
                  {recentActions.map((a) => (
                    <div key={a.id} className="relative flex items-start gap-3 pl-0">
                      <div className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs">
                        {ACTION_ICONS[a.type] ?? "📌"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium truncate">{a.contact.fullName}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{timeAgo(a.performedAt)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {a.type.replace(/_/g, " ")} by {a.performedBy.name}
                        </p>
                        {a.note && <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2">{a.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Email Logs */}
          {emailLogs.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                <Mail className="inline h-3.5 w-3.5 mr-1" /> Email History ({emailLogs.length})
              </h3>
              <div className="space-y-2">
                {emailLogs.slice(0, 10).map((e) => (
                  <div key={e.id} className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="font-medium text-xs truncate">{e.subject}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">{timeAgo(e.sentAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                      <span>To: {e.contact.fullName}</span>
                      <span>·</span>
                      {e.repliedAt ? <span className="text-green-400">Replied</span>
                        : e.openedAt ? <span className="text-amber-400">Opened</span>
                        : e.bouncedAt ? <span className="text-red-400">Bounced</span>
                        : <span>Sent</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
