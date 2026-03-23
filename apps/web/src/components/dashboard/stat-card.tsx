import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: { value: number; positive: boolean };
  iconColor?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  iconColor = "bg-primary/15 text-primary",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-5 py-4 space-y-3",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconColor)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <p
            className={cn(
              "mt-0.5 text-xs font-medium",
              trend.positive ? "text-emerald-400" : "text-red-400"
            )}
          >
            {trend.positive ? "+" : ""}{trend.value}% this week
          </p>
        )}
      </div>
    </div>
  );
}
