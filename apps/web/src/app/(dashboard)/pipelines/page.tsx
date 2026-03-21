"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { DEAL_STAGES } from "@xperise/shared";
import { formatCurrency } from "@/lib/utils";

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

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-muted-foreground">Deal stages and revenue tracking</p>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {DEAL_STAGES.map((stage) => {
          const stageDeals = pipelines.filter((p) => p.dealStage === stage.value);
          const totalRevenue = stageDeals.reduce(
            (sum, p) => sum + parseInt(p.totalRevenue || "0", 10),
            0
          );

          return (
            <div key={stage.value} className="min-w-[280px] flex-shrink-0">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{stage.label}</h3>
                <Badge variant="secondary">{stageDeals.length}</Badge>
              </div>
              <div className="space-y-2">
                {totalRevenue > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(totalRevenue)}
                  </p>
                )}
                {stageDeals.map((deal) => (
                  <Card key={deal.id} className="cursor-pointer hover:border-primary/50 transition-colors">
                    <CardContent className="p-3 space-y-2">
                      <p className="font-medium text-sm">{deal.company.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(deal.totalRevenue)}
                        {" · "}
                        {Math.round(deal.probability * 100)}%
                      </p>
                      {deal.pic && (
                        <p className="text-xs text-muted-foreground">
                          PIC: {deal.pic.name}
                        </p>
                      )}
                      {deal.status && (
                        <p className="text-xs text-muted-foreground truncate">
                          {deal.status}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {stageDeals.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No deals
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
