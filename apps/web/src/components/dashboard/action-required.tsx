"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { CONTACT_STATUSES } from "@xperise/shared";

interface ActionItem {
  contactId: string;
  contactName: string;
  position: string | null;
  companyId: string;
  companyName: string;
  stage: string;
  daysInStage: number;
  daysSinceTouch: number;
  slaOverdue: boolean;
  urgency: "urgent" | "warning" | "normal";
  signal: string;
  assignedTo: string | null;
}

const URGENCY_STYLES = {
  urgent:  { row: "border-l-red-500", dot: "bg-red-500", text: "text-red-400" },
  warning: { row: "border-l-amber-500", dot: "bg-amber-500", text: "text-amber-400" },
  normal:  { row: "border-l-zinc-600", dot: "bg-zinc-500", text: "text-zinc-400" },
};

export function ActionRequired({ items }: { items: ActionItem[] }) {
  const router = useRouter();
  const urgentCount = items.filter((i) => i.urgency === "urgent").length;
  const warningCount = items.filter((i) => i.urgency === "warning").length;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold">Action Required</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length} contacts need attention
            {urgentCount > 0 && <span className="text-red-400 ml-1">({urgentCount} urgent)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {urgentCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-950/60 px-2 py-0.5 text-xs font-medium text-red-400">
              <AlertTriangle className="h-3 w-3" /> {urgentCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-950/60 px-2 py-0.5 text-xs font-medium text-amber-400">
              <Clock className="h-3 w-3" /> {warningCount}
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-border">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground/60">
            All caught up — no urgent actions
          </div>
        ) : (
          items.slice(0, 10).map((item) => {
            const style = URGENCY_STYLES[item.urgency];
            const stageLabel = CONTACT_STATUSES.find((s) => s.value === item.stage)?.label ?? item.stage;
            return (
              <div
                key={item.contactId}
                className={`flex items-center gap-3 px-5 py-3 border-l-2 ${style.row} hover:bg-accent/50 cursor-pointer transition-colors`}
                onClick={() => router.push(`/companies/${item.companyId}`)}
              >
                <div className={`h-2 w-2 rounded-full shrink-0 ${style.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{item.companyName}</span>
                    <span className="text-[11px] text-muted-foreground">— {item.contactName}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                    <span className="text-muted-foreground">{stageLabel}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className={style.text}>{item.signal}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[11px] text-muted-foreground">{item.daysInStage}d</div>
                  {item.assignedTo && (
                    <div className="text-[10px] text-muted-foreground/60">{item.assignedTo}</div>
                  )}
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
