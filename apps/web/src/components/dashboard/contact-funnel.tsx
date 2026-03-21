"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CONTACT_STATUSES } from "@xperise/shared";

interface FunnelData {
  status: string;
  count: number;
}

interface ContactFunnelProps {
  data: FunnelData[];
}

const STATUS_COLORS: Record<string, string> = {
  NO_CONTACT: "bg-zinc-500",
  CONTACT: "bg-blue-500",
  REACHED: "bg-yellow-500",
  FOLLOW_UP: "bg-orange-500",
  MEETING_BOOKED: "bg-purple-500",
  CONVERTED: "bg-green-500",
};

export function ContactFunnel({ data }: ContactFunnelProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contact Status Funnel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {CONTACT_STATUSES.map((status) => {
          const item = data.find((d) => d.status === status.value);
          const count = item?.count ?? 0;
          const width = Math.max((count / maxCount) * 100, 2);

          return (
            <div key={status.value} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{status.label}</span>
                <span className="font-medium">{count}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary">
                <div
                  className={`h-2 rounded-full transition-all ${STATUS_COLORS[status.value] ?? "bg-zinc-500"}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
