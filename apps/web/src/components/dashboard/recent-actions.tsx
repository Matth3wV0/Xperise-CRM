import { ACTION_TYPES } from "@xperise/shared";
import Link from "next/link";
import {
  Mail,
  Linkedin,
  Phone,
  Calendar,
  FileText,
  RefreshCw,
  MoreHorizontal,
} from "lucide-react";

interface Action {
  id: string;
  type: string;
  performedAt: string;
  contact: { id: string; fullName: string };
  performedBy: { id: string; name: string };
  note?: string;
}

interface RecentActionsProps {
  actions: Action[];
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  EMAIL_SENT:       Mail,
  EMAIL_FOLLOW_UP:  Mail,
  LINKEDIN_MESSAGE: Linkedin,
  LINKEDIN_CONNECT: Linkedin,
  PHONE_CALL:       Phone,
  MEETING:          Calendar,
  NOTE:             FileText,
  STATUS_CHANGE:    RefreshCw,
  OTHER:            MoreHorizontal,
};

const ACTION_COLORS: Record<string, string> = {
  EMAIL_SENT:       "bg-blue-950/60 text-blue-400",
  EMAIL_FOLLOW_UP:  "bg-blue-950/60 text-blue-400",
  LINKEDIN_MESSAGE: "bg-sky-950/60 text-sky-400",
  LINKEDIN_CONNECT: "bg-sky-950/60 text-sky-400",
  PHONE_CALL:       "bg-emerald-950/60 text-emerald-400",
  MEETING:          "bg-violet-950/60 text-violet-400",
  NOTE:             "bg-zinc-800/60 text-zinc-400",
  STATUS_CHANGE:    "bg-amber-950/60 text-amber-400",
  OTHER:            "bg-zinc-800/60 text-zinc-400",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function RecentActions({ actions }: RecentActionsProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Recent Activity</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Latest team actions</p>
      </div>

      {actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-1">
          {actions.slice(0, 10).map((action) => {
            const actionType = ACTION_TYPES.find((a) => a.value === action.type);
            const Icon = ACTION_ICONS[action.type] ?? MoreHorizontal;
            const colorClass = ACTION_COLORS[action.type] ?? ACTION_COLORS.OTHER;

            return (
              <div key={action.id} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-accent transition-colors">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colorClass}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">
                    <span className="font-medium">{action.performedBy.name}</span>
                    <span className="text-muted-foreground mx-1">
                      {actionType?.label.toLowerCase() ?? action.type}
                    </span>
                    <Link
                      href={`/contacts/${action.contact.id}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {action.contact.fullName}
                    </Link>
                  </p>
                  {action.note && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{action.note}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {timeAgo(action.performedAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
