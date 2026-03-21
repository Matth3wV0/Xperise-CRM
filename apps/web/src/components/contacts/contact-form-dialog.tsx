"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPost, apiPut, apiGet } from "@/lib/api";
import {
  CONTACT_STATUSES,
  CONTACT_SOURCES,
  CONTACT_TYPES,
  PRIORITIES,
} from "@xperise/shared";
import { X } from "lucide-react";

interface Company {
  id: string;
  name: string;
}

interface ContactFormData {
  fullName: string;
  position: string;
  email: string;
  phone: string;
  linkedin: string;
  source: string;
  priority: number;
  type: string;
  contactStatus: string;
  companyId: string;
  assignedToId: string;
  notes: string;
}

interface ContactFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData?: {
    id: string;
    fullName: string;
    position?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedin?: string | null;
    source: string;
    priority: number;
    type: string;
    contactStatus: string;
    companyId: string;
    assignedToId?: string | null;
    notes?: string | null;
  } | null;
}

const INITIAL_FORM: ContactFormData = {
  fullName: "",
  position: "",
  email: "",
  phone: "",
  linkedin: "",
  source: "DESK_RESEARCH",
  priority: 3,
  type: "HUNTING",
  contactStatus: "NO_CONTACT",
  companyId: "",
  assignedToId: "",
  notes: "",
};

export function ContactFormDialog({ open, onClose, onSaved, editData }: ContactFormDialogProps) {
  const [form, setForm] = useState<ContactFormData>(INITIAL_FORM);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      apiGet<{ data: Company[] }>("/companies?limit=200").then((res) =>
        setCompanies(res.data)
      ).catch(() => {});
      apiGet<{ users: { id: string; name: string }[] }>("/auth/users").then((res) =>
        setUsers(res.users)
      ).catch(() => {});

      if (editData) {
        setForm({
          fullName: editData.fullName,
          position: editData.position ?? "",
          email: editData.email ?? "",
          phone: editData.phone ?? "",
          linkedin: editData.linkedin ?? "",
          source: editData.source,
          priority: editData.priority,
          type: editData.type,
          contactStatus: editData.contactStatus,
          companyId: editData.companyId,
          assignedToId: editData.assignedToId ?? "",
          notes: editData.notes ?? "",
        });
      } else {
        setForm(INITIAL_FORM);
      }
    }
  }, [open, editData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = {
        ...form,
        assignedToId: form.assignedToId || undefined,
        linkedin: form.linkedin || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        notes: form.notes || undefined,
      };

      if (editData) {
        await apiPut(`/contacts/${editData.id}`, payload);
      } else {
        await apiPost("/contacts", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{editData ? "Edit Contact" : "Add Contact"}</CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Full Name *</label>
                <input
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </div>

              {/* Company */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Company *</label>
                <select
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.companyId}
                  onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                >
                  <option value="">Select company...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Position */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Position</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              {/* LinkedIn */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">LinkedIn</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="https://linkedin.com/in/..."
                  value={form.linkedin}
                  onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                />
              </div>

              {/* Source */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Source</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                >
                  {CONTACT_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Type */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {CONTACT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Priority</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.contactStatus}
                  onChange={(e) => setForm({ ...form, contactStatus: e.target.value })}
                >
                  {CONTACT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Assigned To */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Assigned To</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.assignedToId}
                  onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editData ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
