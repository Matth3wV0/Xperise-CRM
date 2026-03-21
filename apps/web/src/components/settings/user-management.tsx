"use client";

import { useState, useEffect } from "react";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLES } from "@xperise/shared";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLE_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ADMIN: "destructive",
  MANAGER: "default",
  BD_STAFF: "secondary",
  VIEWER: "outline",
};

export function UserManagement() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "BD_STAFF" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadUsers() {
    try {
      const res = await apiGet<{ users: User[] }>("/auth/users");
      setUsers(res.users);
    } catch {}
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await apiPost("/auth/register", form);
      setForm({ email: "", name: "", password: "", role: "BD_STAFF" });
      setShowAdd(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">User Management</CardTitle>
          <CardDescription>{users.length} team members</CardDescription>
        </div>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
            <UserPlus className="mr-2 h-4 w-4" /> Add User
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add User Form */}
        {showAdd && (
          <form onSubmit={handleAdd} className="rounded-lg border p-4 space-y-3">
            {error && (
              <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                placeholder="Full name"
                className="rounded-md border bg-background px-3 py-2 text-sm outline-none"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                required
                type="email"
                placeholder="Email"
                className="rounded-md border bg-background px-3 py-2 text-sm outline-none"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <input
                required
                type="password"
                placeholder="Password (min 8 chars)"
                minLength={8}
                className="rounded-md border bg-background px-3 py-2 text-sm outline-none"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Creating..." : "Create User"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* User List */}
        <div className="space-y-2">
          {users.map((user) => {
            const role = ROLES.find((r) => r.value === user.role);
            return (
              <div key={user.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                  {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant={ROLE_COLORS[user.role] ?? "secondary"}>
                  {role?.label ?? user.role}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
