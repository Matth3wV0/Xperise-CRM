import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ACTION_TYPES } from "@xperise/shared";

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

export function RecentActions({ actions }: RecentActionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {actions.length === 0 && (
            <p className="text-sm text-muted-foreground">No recent actions</p>
          )}
          {actions.map((action) => {
            const actionType = ACTION_TYPES.find((a) => a.value === action.type);
            return (
              <div
                key={action.id}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm">
                    <span className="font-medium">{action.performedBy.name}</span>
                    {" "}
                    <span className="text-muted-foreground">
                      {actionType?.label.toLowerCase() ?? action.type}
                    </span>
                    {" "}
                    <span className="font-medium">{action.contact.fullName}</span>
                  </p>
                  {action.note && (
                    <p className="truncate text-xs text-muted-foreground">{action.note}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(action.performedAt).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {actionType?.label ?? action.type}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
