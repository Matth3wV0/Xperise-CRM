"use client";

import { useEffect, useState } from "react";
import { Users, Building2, TrendingUp, CheckCircle } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { ContactFunnel } from "@/components/dashboard/contact-funnel";
import { RecentActions } from "@/components/dashboard/recent-actions";
import { apiGet } from "@/lib/api";
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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, funnelRes, actionsRes] = await Promise.all([
          apiGet<{ totalContacts: number; totalCompanies: number; contactsByStatus: Record<string, number>; totalPipelineRevenue: string }>("/dashboard/stats"),
          apiGet<{ funnel: FunnelItem[] }>("/dashboard/funnel"),
          apiGet<{ actions: ActionItem[] }>("/dashboard/recent-actions"),
        ]);
        setStats(statsRes);
        setFunnel(funnelRes.funnel);
        setActions(actionsRes.actions);
      } catch (err) {
        console.error("Failed to load dashboard:", err);
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

  const reached = (stats?.contactsByStatus?.REACHED ?? 0) +
    (stats?.contactsByStatus?.FOLLOW_UP ?? 0) +
    (stats?.contactsByStatus?.MEETING_BOOKED ?? 0) +
    (stats?.contactsByStatus?.CONVERTED ?? 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Xperise BD Pipeline Overview
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Contacts"
          value={stats?.totalContacts ?? 0}
          icon={Users}
        />
        <StatCard
          title="Companies"
          value={stats?.totalCompanies ?? 0}
          icon={Building2}
        />
        <StatCard
          title="Reached+"
          value={reached}
          icon={CheckCircle}
          description="Reached, Follow-up, Meeting, Converted"
        />
        <StatCard
          title="Pipeline Revenue"
          value={formatCurrency(stats?.totalPipelineRevenue ?? "0")}
          icon={TrendingUp}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ContactFunnel data={funnel} />
        <RecentActions actions={actions} />
      </div>
    </div>
  );
}
