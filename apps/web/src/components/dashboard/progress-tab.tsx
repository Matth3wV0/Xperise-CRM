"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, CheckCircle, PauseCircle, XCircle, Plus } from "lucide-react";
import { apiGet } from "@/lib/api";
import { CONTACT_STATUSES } from "@xperise/shared";

interface WeeklyMetric {
  metric: string;
  current: number;
  previous: number;
}

interface StageMovement {
  promoted: { company: string; contact: string; fromTo: string }[];
  stuck: { company: string; contact: string; stage: string; daysSinceTouch: number }[];
  lost: { company: string; contact: string; reason: string }[];
  newEntries: { company: string; contact: string }[];
}

interface ProgressData {
  weeklyComparison: WeeklyMetric[];
  stageMovement: StageMovement;
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : diff > 0 ? 100 : 0;
  if (diff === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" /> 0%</span>;
  if (diff > 0) return <span className="inline-flex items-center gap-0.5 text-xs text-green-400"><TrendingUp className="h-3 w-3" /> +{pct}%</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs text-red-400"><TrendingDown className="h-3 w-3" /> {pct}%</span>;
}

export function ProgressTab() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<ProgressData>("/dashboard/progress")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-[300px] animate-pulse rounded-xl bg-secondary" />
        ))}
      </div>
    );
  }

  if (!data) return null;
  const { weeklyComparison, stageMovement } = data;

  return (
    <div className="space-y-6">
      {/* Weekly Comparison Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Weekly Comparison</h3>
          <p className="text-xs text-muted-foreground mt-0.5">This week vs last week</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metric</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last Week</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">This Week</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {weeklyComparison.map((m) => (
                <tr key={m.metric} className="hover:bg-accent/30 transition-colors">
                  <td className="px-5 py-3 text-sm">{m.metric}</td>
                  <td className="px-5 py-3 text-sm text-right text-muted-foreground tabular-nums">{m.previous}</td>
                  <td className="px-5 py-3 text-sm text-right font-semibold tabular-nums">{m.current}</td>
                  <td className="px-5 py-3 text-right"><TrendBadge current={m.current} previous={m.previous} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stage Movement */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Promoted */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-green-400" /> Promoted ({stageMovement.promoted.length})
          </h3>
          {stageMovement.promoted.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 text-center py-4">No promotions this week</p>
          ) : (
            <div className="space-y-2">
              {stageMovement.promoted.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-green-950/10 px-3 py-2 text-sm">
                  <div>
                    <span className="font-semibold">{p.company}</span>
                    <span className="text-muted-foreground ml-2">— {p.contact}</span>
                  </div>
                  <span className="text-[11px] text-green-400 shrink-0">{p.fromTo}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stuck */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
            <PauseCircle className="h-3.5 w-3.5 text-amber-400" /> Stuck ({stageMovement.stuck.length})
          </h3>
          {stageMovement.stuck.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 text-center py-4">No stuck contacts</p>
          ) : (
            <div className="space-y-2">
              {stageMovement.stuck.map((s, i) => {
                const label = CONTACT_STATUSES.find((st) => st.value === s.stage)?.label ?? s.stage;
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-amber-950/10 px-3 py-2 text-sm">
                    <div>
                      <span className="font-semibold">{s.company}</span>
                      <span className="text-muted-foreground ml-2">— {s.contact}</span>
                    </div>
                    <span className="text-[11px] text-amber-400 shrink-0">{label}, {s.daysSinceTouch}d</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lost */}
        {stageMovement.lost.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-red-400" /> Lost ({stageMovement.lost.length})
            </h3>
            <div className="space-y-2">
              {stageMovement.lost.map((l, i) => (
                <div key={i} className="rounded-lg border border-border bg-red-950/10 px-3 py-2 text-sm">
                  <span className="font-semibold">{l.company}</span>
                  <span className="text-muted-foreground ml-2">— {l.contact}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New entries */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-blue-400" /> New This Week ({stageMovement.newEntries.length})
          </h3>
          {stageMovement.newEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 text-center py-4">No new contacts this week</p>
          ) : (
            <div className="space-y-2">
              {stageMovement.newEntries.map((n, i) => (
                <div key={i} className="rounded-lg border border-border bg-blue-950/10 px-3 py-2 text-sm">
                  <span className="font-semibold">{n.company}</span>
                  <span className="text-muted-foreground ml-2">— {n.contact}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
