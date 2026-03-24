"use client";

import { useEffect, useState } from "react";
import { Mail, Clock, BarChart3, Award } from "lucide-react";
import { apiGet } from "@/lib/api";

interface OutreachAnalytics {
  emailsByStatus: Record<string, number>;
  channelActivity: { type: string; count: number }[];
  topSubjects: { subject: string; opens: number }[];
  sendTimeHeatmap: { hour: number; sent: number; opened: number }[];
  sequenceCompletion: {
    name: string;
    totalRecipients: number;
    completed: number;
    replied: number;
    bounced: number;
    completionRate: number;
  }[];
}

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL_SENT: "Email", EMAIL_FOLLOW_UP: "Email Follow-up",
  LINKEDIN_CONNECT: "LinkedIn Connect", LINKEDIN_MESSAGE: "LinkedIn Msg",
  LINKEDIN_ACCEPTED: "LinkedIn Accept", PHONE_CALL: "Phone",
  MEETING: "Meeting", NOTE: "Note", STATUS_CHANGE: "Status", OTHER: "Other",
};

const CHANNEL_COLORS: Record<string, string> = {
  EMAIL_SENT: "bg-blue-500", EMAIL_FOLLOW_UP: "bg-blue-400",
  LINKEDIN_CONNECT: "bg-sky-500", LINKEDIN_MESSAGE: "bg-sky-400",
  PHONE_CALL: "bg-emerald-500", MEETING: "bg-violet-500",
  NOTE: "bg-zinc-500", STATUS_CHANGE: "bg-amber-500", OTHER: "bg-zinc-600",
  LINKEDIN_ACCEPTED: "bg-sky-300",
};

export function OutreachAnalyticsTab() {
  const [data, setData] = useState<OutreachAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<OutreachAnalytics>("/dashboard/outreach-analytics")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[250px] animate-pulse rounded-xl bg-secondary" />
        ))}
      </div>
    );
  }

  if (!data) return null;
  const maxChannelCount = Math.max(...data.channelActivity.map((c) => c.count), 1);

  return (
    <div className="space-y-6">
      {/* Channel Effectiveness */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-muted-foreground" /> Channel Activity (last 30 days)
        </h3>
        <p className="text-xs text-muted-foreground mb-4">Actions by channel type</p>
        <div className="space-y-2.5">
          {data.channelActivity
            .filter((c) => c.count > 0)
            .sort((a, b) => b.count - a.count)
            .map((c) => {
              const barWidth = Math.max((c.count / maxChannelCount) * 100, 4);
              const color = CHANNEL_COLORS[c.type] ?? "bg-zinc-500";
              return (
                <div key={c.type} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{CHANNEL_LABELS[c.type] ?? c.type}</span>
                    <span className="font-semibold tabular-nums">{c.count}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                    <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${barWidth}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Top Subject Lines */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
            <Award className="h-4 w-4 text-muted-foreground" /> Top Subject Lines
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Highest open rate (last 30 days)</p>
          {data.topSubjects.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 text-center py-4">No email data yet</p>
          ) : (
            <div className="space-y-2.5">
              {data.topSubjects.map((s, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.subject}</p>
                    <p className="text-[11px] text-muted-foreground">{s.opens} opens</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Send Time Heatmap */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" /> Best Send Times
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Opens by hour of day</p>
          {data.sendTimeHeatmap.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 text-center py-4">No email data yet</p>
          ) : (
            <div className="space-y-1">
              {data.sendTimeHeatmap
                .sort((a, b) => b.opened - a.opened)
                .slice(0, 8)
                .map((h) => {
                  const rate = h.sent > 0 ? Math.round((h.opened / h.sent) * 100) : 0;
                  return (
                    <div key={h.hour} className="flex items-center gap-3 text-sm">
                      <span className="w-12 text-right text-muted-foreground tabular-nums">{String(h.hour).padStart(2, "0")}:00</span>
                      <div className="flex-1 h-4 rounded bg-secondary overflow-hidden">
                        <div className="h-full rounded bg-emerald-500/60 transition-all" style={{ width: `${rate}%` }} />
                      </div>
                      <span className="w-16 text-right text-xs tabular-nums">
                        {h.opened}/{h.sent} <span className="text-muted-foreground">({rate}%)</span>
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Sequence Completion */}
      {data.sequenceCompletion.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
            <Mail className="h-4 w-4 text-muted-foreground" /> Sequence Completion
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Campaign sequence status</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Campaign</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Recipients</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Completed</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Replied</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Bounced</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.sequenceCompletion.map((s) => (
                  <tr key={s.name} className="hover:bg-accent/30">
                    <td className="px-3 py-2 text-sm font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums">{s.totalRecipients}</td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums">{s.completed}</td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-green-400">{s.replied}</td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-red-400">{s.bounced}</td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums font-semibold">{s.completionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
