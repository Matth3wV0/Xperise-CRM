"use client";

import { useEffect, useState } from "react";
import { Users, Building2, TrendingUp, Target } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { ContactFunnel } from "@/components/dashboard/contact-funnel";
import { RecentActions } from "@/components/dashboard/recent-actions";
import { OutreachStats } from "@/components/dashboard/outreach-stats";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

interface DashboardStats {
  totalContacts: number;
  totalCompanies: number;
  contactsByStatus: Record<string, number>;
  totalPipelineRevenue: string;
}

interface FunnelItem {
  status: string;
  count: number;
}

interface ActionItem {
  id: string;
  type: string;
  performedAt: string;
  contact: { id: string; fullName: string };
  performedBy: { id: string; name: string };
  note?: string;
}

interface OutreachData {
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

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-secondary ${className ?? ""}`} />;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [outreach, setOutreach] = useState<OutreachData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, funnelRes, actionsRes, outreachRes] = await Promise.all([
          apiGet<DashboardStats>("/dashboard/stats"),
          apiGet<{ funnel: FunnelItem[] }>("/dashboard/funnel"),
          apiGet<{ actions: ActionItem[] }>("/dashboard/recent-actions"),
          apiGet<OutreachData>("/dashboard/outreach-stats").catch(() => null),
        ]);
        setStats(statsRes);
        setFunnel(funnelRes.funnel);
        setActions(actionsRes.actions);
        if (outreachRes) setOutreach(outreachRes);
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeLeads =
    (stats?.contactsByStatus?.REACHED ?? 0) +
    (stats?.contactsByStatus?.FOLLOW_UP ?? 0) +
    (stats?.contactsByStatus?.MEETING_BOOKED ?? 0);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting()}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Here&apos;s your BD pipeline overview
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p className="font-medium">{new Date().toLocaleDateString("vi-VN", { weekday: "long" })}</p>
          <p>{new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric" })}</p>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Contacts"
            value={stats?.totalContacts ?? 0}
            icon={Users}
            iconColor="bg-indigo-950/60 text-indigo-400"
          />
          <StatCard
            title="Companies"
            value={stats?.totalCompanies ?? 0}
            icon={Building2}
            iconColor="bg-emerald-950/60 text-emerald-400"
          />
          <StatCard
            title="Active Leads"
            value={activeLeads}
            icon={Target}
            description="Reached, Follow-up, Meeting"
            iconColor="bg-amber-950/60 text-amber-400"
          />
          <StatCard
            title="Pipeline Revenue"
            value={formatCurrency(stats?.totalPipelineRevenue ?? "0")}
            icon={TrendingUp}
            iconColor="bg-violet-950/60 text-violet-400"
          />
        </div>
      )}

      {/* Charts */}
      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[340px] rounded-xl" />
          <Skeleton className="h-[340px] rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ContactFunnel data={funnel} />
          <RecentActions actions={actions} />
        </div>
      )}

      {/* Outreach Performance */}
      {!loading && outreach && (
        <OutreachStats data={outreach} />
      )}
    </div>
  );
}
