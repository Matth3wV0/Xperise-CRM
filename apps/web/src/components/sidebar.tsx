"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Users,
  Building2,
  TrendingUp,
  Mail,
  Search,
  Settings,
  LogOut,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Main",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Contacts", href: "/contacts", icon: Users },
      { name: "Companies", href: "/companies", icon: Building2 },
      { name: "Pipeline", href: "/pipelines", icon: TrendingUp },
    ],
  },
  {
    label: "Tools",
    items: [
      { name: "Apollo", href: "/apollo", icon: Search },
      { name: "Campaigns", href: "/campaigns", icon: Mail },
    ],
  },
  {
    label: "Admin",
    items: [
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-900/50 text-red-400",
  MANAGER: "bg-violet-900/50 text-violet-400",
  BD_STAFF: "bg-indigo-900/50 text-indigo-400",
  VIEWER: "bg-zinc-800/50 text-zinc-400",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  BD_STAFF: "BD Staff",
  VIEWER: "Viewer",
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <aside className="flex h-screen w-[220px] flex-col border-r border-border bg-card shrink-0">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <Image src="/icon.png" alt="Xperise Logo" width={28} height={28} className="rounded-lg shrink-0" />
        <span className="text-sm font-semibold tracking-tight">Xperise CRM</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-accent transition-colors">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground ring-1 ring-border">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{user?.name}</p>
            <span
              className={cn(
                "inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                ROLE_COLORS[user?.role ?? "VIEWER"] ?? "bg-zinc-800/50 text-zinc-400"
              )}
            >
              {ROLE_LABELS[user?.role ?? "VIEWER"] ?? user?.role}
            </span>
          </div>
          <button
            onClick={logout}
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
