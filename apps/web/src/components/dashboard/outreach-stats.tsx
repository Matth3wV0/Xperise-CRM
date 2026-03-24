"use client";

import { Mail, Eye, MessageSquareReply, XCircle, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

interface OutreachStatsData {
  activeCampaigns: number;
  totalRecipients: number;
  totalSent: number;
  opened: number;
  replied: number;
  bounced: number;
  openRate: string;
  replyRate: string;
  bounceRate: string;
  recentCampaigns: {
    id: string;
    name: string;
    status: string;
    recipients: number;
    emails: number;
  }[];
}

interface OutreachStatsProps {
  data: OutreachStatsData | null;
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-500",
  COMPLETED: "bg-blue-500",
  PAUSED: "bg-amber-500",
};

export function OutreachStats({ data }: OutreachStatsProps) {
  if (!data) return null;

  const metrics = [
    { label: "Sent", value: data.totalSent, icon: Mail, color: "text-blue-400" },
    { label: "Opened", value: data.opened, rate: data.openRate, icon: Eye, color: "text-emerald-400" },
    { label: "Replied", value: data.replied, rate: data.replyRate, icon: MessageSquareReply, color: "text-violet-400" },
    { label: "Bounced", value: data.bounced, rate: data.bounceRate, icon: XCircle, color: "text-red-400" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Outreach Performance</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Megaphone className="h-3.5 w-3.5" />
          {data.activeCampaigns} active
        </div>
      </div>

      {/* Email metrics grid */}
      <div className="grid grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <m.icon className={cn("h-3.5 w-3.5", m.color)} />
              <span className="text-xs text-muted-foreground">{m.label}</span>
            </div>
            <p className="text-lg font-bold">{m.value}</p>
            {m.rate && (
              <p className={cn("text-xs font-medium", m.color)}>{m.rate}%</p>
            )}
          </div>
        ))}
      </div>

      {/* Recent campaigns */}
      {data.recentCampaigns.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recent Campaigns
          </p>
          {data.recentCampaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    STATUS_COLOR[c.status] ?? "bg-zinc-500"
                  )}
                />
                <span className="truncate max-w-[180px]">{c.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {c.recipients} contacts · {c.emails} emails
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
