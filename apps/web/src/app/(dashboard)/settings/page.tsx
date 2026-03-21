"use client";

import { useAuth } from "@/lib/auth";
import { ExcelImport } from "@/components/settings/excel-import";
import { UserManagement } from "@/components/settings/user-management";
import { TelegramConnect } from "@/components/settings/telegram-connect";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SettingsPage() {
  const { isAdmin, canManage } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage users, roles, and app configuration</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Management */}
        {canManage && <UserManagement />}

        {/* Excel Import */}
        {isAdmin && <ExcelImport />}

        {/* Telegram Bot */}
        <TelegramConnect />

        {/* Apollo.io (Phase 2) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Apollo.io Integration</CardTitle>
            <CardDescription>Connect to Apollo for contact enrichment and email campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Phase 2 — Configure Apollo.io API key, search contacts, enrich data, and send email sequences
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications Config */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notification Preferences</CardTitle>
            <CardDescription>Configure alert preferences for lead status changes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Coming soon — Email and in-app notification settings
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
