"use client";

import { useEffect, useState } from "react";
import { Users, Activity, Clock, Briefcase } from "lucide-react";
import { apiGet } from "@/lib/api";

interface TeamMember {
  userId: string;
  name: string;
  role: string;
  activitiesThisWeek: number;
  contactsManaged: number;
  avgResponseHours: number | null;
}

const ROLE_STYLES: Record<string, string> = {
  ADMIN: "bg-violet-950/60 text-violet-300",
  MANAGER: "bg-blue-950/60 text-blue-300",
  BD_STAFF: "bg-emerald-950/60 text-emerald-300",
  VIEWER: "bg-zinc-800/60 text-zinc-300",
};

export function TeamActivityTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ teamMembers: TeamMember[] }>("/dashboard/team-activity")
      .then((res) => setMembers(res.teamMembers))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-[300px] animate-pulse rounded-xl bg-secondary" />;
  }

  const maxActivities = Math.max(...members.map((m) => m.activitiesThisWeek), 1);
  const totalActivities = members.reduce((s, m) => s + m.activitiesThisWeek, 0);
  const totalContacts = members.reduce((s, m) => s + m.contactsManaged, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Active Members</span>
          </div>
          <p className="text-2xl font-bold">{members.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Total Activities (week)</span>
          </div>
          <p className="text-2xl font-bold">{totalActivities}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Briefcase className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Total Contacts Managed</span>
          </div>
          <p className="text-2xl font-bold">{totalContacts}</p>
        </div>
      </div>

      {/* Team table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Team Performance</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Activities this week, workload, and response time</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Member</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activities</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground min-w-[200px]">Activity Bar</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contacts</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg Response</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground/60">
                    No activity data this week
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const barWidth = Math.max((m.activitiesThisWeek / maxActivities) * 100, 4);
                  const roleStyle = ROLE_STYLES[m.role] ?? ROLE_STYLES.BD_STAFF;
                  const responseOk = m.avgResponseHours != null && m.avgResponseHours <= 24;
                  return (
                    <tr key={m.userId} className="hover:bg-accent/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold ring-1 ring-border">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold">{m.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${roleStyle}`}>
                          {m.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-semibold tabular-nums">{m.activitiesThisWeek}</td>
                      <td className="px-5 py-3">
                        <div className="h-3 w-full rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-right tabular-nums">{m.contactsManaged}</td>
                      <td className="px-5 py-3 text-sm text-right">
                        {m.avgResponseHours != null ? (
                          <span className={`flex items-center justify-end gap-1 tabular-nums ${responseOk ? "text-green-400" : "text-amber-400"}`}>
                            <Clock className="h-3 w-3" />
                            {m.avgResponseHours}h
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
