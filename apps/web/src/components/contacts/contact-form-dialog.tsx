"use client";

import { useState, useEffect } from "react";
import { apiPost, apiPut, apiGet } from "@/lib/api";
import {
  CONTACT_STATUSES,
  CONTACT_SOURCES,
  CONTACT_TYPES,
  PRIORITIES,
} from "@xperise/shared";
import { X, Building2, AlertCircle } from "lucide-react";

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

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
      {children}
      {required && <span className="ml-0.5 text-red-400">*</span>}
    </label>
  );
}

function inputClass(hasError = false) {
  return `w-full rounded-lg border bg-secondary px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary ${
    hasError ? "border-red-500" : "border-border"
  }`;
}

export function ContactFormDialog({ open, onClose, onSaved, editData }: ContactFormDialogProps) {
  const [form, setForm] = useState<ContactFormData>(INITIAL_FORM);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  useEffect(() => {
    if (!open) return;

    // BUG FIX: companyFilterSchema caps limit at max(100). Using limit=200 caused
    // a Zod validation error → API 500 → silent catch → companies stayed empty.
    setLoadingCompanies(true);
    apiGet<{ data: Company[] }>("/companies?limit=100&sortBy=name&sortOrder=asc")
      .then((res) => setCompanies(res.data))
      .catch(() => setCompanies([]))
      .finally(() => setLoadingCompanies(false));

    apiGet<{ users: { id: string; name: string }[] }>("/auth/users")
      .then((res) => setUsers(res.users))
      .catch(() => setUsers([]));

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

    setError("");
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
        position: form.position || undefined,
      };

      if (editData) {
        await apiPut(`/contacts/${editData.id}`, payload);
      } else {
        await apiPost("/contacts", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contact");
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (!open) return null;

  const title = editData ? "Edit Contact" : "Add Contact";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {editData ? "Update contact information" : "Add a new contact to the CRM"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-800/40 bg-red-950/40 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Section: Basic info */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60 mb-3">Basic Information</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel required>Full Name</FieldLabel>
                <input
                  required
                  className={inputClass()}
                  placeholder="Nguyen Van A"
                  value={form.fullName}
                  onChange={(e) => setField("fullName", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel required>Company</FieldLabel>
                {loadingCompanies ? (
                  <div className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground animate-pulse">
                    Loading companies...
                  </div>
                ) : (
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <select
                      required
                      className={`${inputClass()} pl-8`}
                      value={form.companyId}
                      onChange={(e) => setField("companyId", e.target.value)}
                    >
                      <option value="">Select company...</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {!loadingCompanies && companies.length === 0 && (
                  <p className="mt-1 text-xs text-amber-400">No companies found. Add a company first.</p>
                )}
              </div>

              <div>
                <FieldLabel>Position</FieldLabel>
                <input
                  className={inputClass()}
                  placeholder="CFO, VP Operations..."
                  value={form.position}
                  onChange={(e) => setField("position", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>Email</FieldLabel>
                <input
                  type="email"
                  className={inputClass()}
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>Phone</FieldLabel>
                <input
                  className={inputClass()}
                  placeholder="+84 ..."
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>LinkedIn URL</FieldLabel>
                <input
                  className={inputClass()}
                  placeholder="https://linkedin.com/in/..."
                  value={form.linkedin}
                  onChange={(e) => setField("linkedin", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section: Classification */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60 mb-3">Classification</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Source</FieldLabel>
                <select
                  className={inputClass()}
                  value={form.source}
                  onChange={(e) => setField("source", e.target.value)}
                >
                  {CONTACT_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel>Type</FieldLabel>
                <select
                  className={inputClass()}
                  value={form.type}
                  onChange={(e) => setField("type", e.target.value)}
                >
                  {CONTACT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel>Priority</FieldLabel>
                <select
                  className={inputClass()}
                  value={form.priority}
                  onChange={(e) => setField("priority", Number(e.target.value))}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel>Status</FieldLabel>
                <select
                  className={inputClass()}
                  value={form.contactStatus}
                  onChange={(e) => setField("contactStatus", e.target.value)}
                >
                  {CONTACT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <FieldLabel>Assigned To</FieldLabel>
                <select
                  className={inputClass()}
                  value={form.assignedToId}
                  onChange={(e) => setField("assignedToId", e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea
              rows={3}
              className={`${inputClass()} resize-none`}
              placeholder="Any additional notes about this contact..."
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  Saving...
                </span>
              ) : editData ? "Update Contact" : "Create Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
