"use client";

import { CONTACT_STATUSES } from "@xperise/shared";

interface FunnelData {
  status: string;
  count: number;
}

interface ContactFunnelProps {
  data: FunnelData[];
}

const STATUS_STYLES: Record<string, { bar: string; text: string; dot: string }> = {
  NO_CONTACT: { bar: "bg-zinc-600", text: "text-zinc-400", dot: "bg-zinc-500" },
  CONTACT:    { bar: "bg-blue-500", text: "text-blue-400", dot: "bg-blue-500" },
  REACHED:    { bar: "bg-amber-500", text: "text-amber-400", dot: "bg-amber-500" },
  FOLLOW_UP:  { bar: "bg-orange-500", text: "text-orange-400", dot: "bg-orange-500" },
  MEETING_BOOKED: { bar: "bg-violet-500", text: "text-violet-400", dot: "bg-violet-500" },
  CONVERTED:  { bar: "bg-emerald-500", text: "text-emerald-400", dot: "bg-emerald-500" },
};

export function ContactFunnel({ data }: ContactFunnelProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Contact Funnel</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{total} total contacts</p>
        </div>
      </div>

      <div className="space-y-3">
        {CONTACT_STATUSES.map((status) => {
          const item = data.find((d) => d.status === status.value);
          const count = item?.count ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const barWidth = Math.max((count / maxCount) * 100, count > 0 ? 4 : 0);
          const styles = STATUS_STYLES[status.value] ?? STATUS_STYLES.NO_CONTACT;

          return (
            <div key={status.value} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${styles.dot}`} />
                  <span className="text-muted-foreground">{status.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold tabular-nums ${styles.text}`}>{count}</span>
                  <span className="text-muted-foreground/60 w-8 text-right">{pct}%</span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${styles.bar}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
