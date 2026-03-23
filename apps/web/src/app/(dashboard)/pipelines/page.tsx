"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { DEAL_STAGES } from "@xperise/shared";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, DollarSign } from "lucide-react";

interface Pipeline {
  id: string;
  dealStage: string;
  totalRevenue: string;
  probability: number;
  status: string | null;
  notes: string | null;
  company: { id: string; name: string; industry: string };
  pic: { id: string; name: string } | null;
}

const STAGE_STYLES: Record<string, { header: string; dot: string; count: string }> = {
  NEW_CONVERTED: {
    header: "border-t-zinc-500",
    dot: "bg-zinc-500",
    count: "bg-zinc-800 text-zinc-400",
  },
  MEETING: {
    header: "border-t-blue-500",
    dot: "bg-blue-500",
    count: "bg-blue-950 text-blue-400",
  },
  PROPOSAL: {
    header: "border-t-indigo-500",
    dot: "bg-indigo-500",
    count: "bg-indigo-950 text-indigo-400",
  },
  PILOT_POC: {
    header: "border-t-amber-500",
    dot: "bg-amber-500",
    count: "bg-amber-950 text-amber-400",
  },
  NEGOTIATION: {
    header: "border-t-orange-500",
    dot: "bg-orange-500",
    count: "bg-orange-950 text-orange-400",
  },
  CLOSED_WON: {
    header: "border-t-emerald-500",
    dot: "bg-emerald-500",
    count: "bg-emerald-950 text-emerald-400",
  },
  CLOSED_LOST: {
    header: "border-t-red-500",
    dot: "bg-red-500",
    count: "bg-red-950 text-red-400",
  },
};

const DEFAULT_STAGE_STYLE = STAGE_STYLES.NEW_CONVERTED;

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-secondary ${className ?? ""}`} />;
}

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiGet<{ pipelines: Pipeline[] }>("/pipelines");
        setPipelines(res.pipelines);
      } catch (err) {
        console.error("Failed to load pipelines:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalRevenue = pipelines
    .filter((p) => p.dealStage !== "CLOSED_LOST")
    .reduce((sum, p) => sum + parseInt(p.totalRevenue || "0", 10), 0);

  const totalDeals = pipelines.filter((p) => p.dealStage !== "CLOSED_LOST").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Deal stages and revenue tracking</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-border bg-card px-4 py-2.5 text-right">
            <p className="text-xs text-muted-foreground">Active Deals</p>
            <p className="text-lg font-bold">{totalDeals}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-2.5 text-right">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-lg font-bold">{formatCurrency(totalRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="min-w-[260px] shrink-0 space-y-3">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {DEAL_STAGES.map((stage) => {
            const stageDeals = pipelines.filter((p) => p.dealStage === stage.value);
            const stageRevenue = stageDeals.reduce(
              (sum, p) => sum + parseInt(p.totalRevenue || "0", 10),
              0
            );
            const style = STAGE_STYLES[stage.value] ?? DEFAULT_STAGE_STYLE;

            return (
              <div key={stage.value} className="min-w-[260px] shrink-0 flex flex-col gap-3">
                {/* Column header */}
                <div
                  className={`rounded-xl border border-border bg-card px-4 py-3 border-t-2 ${style.header}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${style.dot}`} />
                      <h3 className="text-xs font-semibold">{stage.label}</h3>
                    </div>
                    <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${style.count}`}>
                      {stageDeals.length}
                    </span>
                  </div>
                  {stageRevenue > 0 && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <DollarSign className="h-3 w-3" />
                      {formatCurrency(stageRevenue)}
                    </div>
                  )}
                </div>

                {/* Deals */}
                <div className="flex flex-col gap-2 flex-1">
                  {stageDeals.map((deal) => {
                    const pct = Math.round(deal.probability * 100);
                    return (
                      <div
                        key={deal.id}
                        className="group rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/50 cursor-pointer transition-all"
                      >
                        <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                          {deal.company.name}
                        </p>

                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium">
                            <TrendingUp className="h-3 w-3" />
                            {formatCurrency(deal.totalRevenue)}
                          </span>
                          <span>{pct}%</span>
                        </div>

                        {/* Probability bar */}
                        <div className="mt-2 h-1 w-full rounded-full bg-secondary overflow-hidden">
                          <div
                            className={`h-full rounded-full ${style.dot}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {(deal.pic || deal.status) && (
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            {deal.pic && (
                              <span className="flex items-center gap-1">
                                <div className="h-4 w-4 rounded-full bg-secondary text-[9px] font-semibold flex items-center justify-center ring-1 ring-border">
                                  {deal.pic.name.charAt(0).toUpperCase()}
                                </div>
                                {deal.pic.name}
                              </span>
                            )}
                            {deal.status && deal.pic && <span>·</span>}
                            {deal.status && (
                              <span className="truncate max-w-[120px]">{deal.status}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {stageDeals.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/50 px-4 py-6 text-center">
                      <p className="text-xs text-muted-foreground/50">No deals</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
