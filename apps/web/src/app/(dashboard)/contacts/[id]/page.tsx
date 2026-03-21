"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Mail, Phone, Linkedin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { CONTACT_STATUSES, ACTION_TYPES, PRIORITIES } from "@xperise/shared";

interface ContactDetail {
  id: string;
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  source: string;
  priority: number;
  type: string;
  contactStatus: string;
  emailVerify: string;
  notes: string | null;
  companyId: string;
  assignedToId: string | null;
  createdAt: string;
  company: { id: string; name: string; industry: string };
  assignedTo: { id: string; name: string; email: string } | null;
  actions: {
    id: string;
    type: string;
    status: string;
    note: string | null;
    performedAt: string;
    performedBy: { id: string; name: string };
  }[];
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { canEdit } = useAuth();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const [actionForm, setActionForm] = useState({ type: "NOTE", note: "" });
  const [savingAction, setSavingAction] = useState(false);

  async function loadContact() {
    try {
      const res = await apiGet<{ contact: ContactDetail }>(`/contacts/${id}`);
      setContact(res.contact);
    } catch {
      router.push("/contacts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContact();
  }, [id]);

  async function handleAddAction(e: React.FormEvent) {
    e.preventDefault();
    setSavingAction(true);
    try {
      await apiPost(`/contacts/${id}/actions`, {
        type: actionForm.type,
        note: actionForm.note || undefined,
      });
      setActionForm({ type: "NOTE", note: "" });
      setShowAction(false);
      loadContact();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingAction(false);
    }
  }

  if (loading || !contact) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const status = CONTACT_STATUSES.find((s) => s.value === contact.contactStatus);
  const priority = PRIORITIES.find((p) => p.value === contact.priority);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/contacts")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{contact.fullName}</h1>
          <p className="text-muted-foreground">
            {contact.position ?? "No position"} at {contact.company.name}
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => setShowEdit(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Contact Info */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {contact.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${contact.email}`} className="hover:underline">
                    {contact.email}
                  </a>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {contact.emailVerify}
                  </Badge>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {contact.phone}
                </div>
              )}
              {contact.linkedin && (
                <div className="flex items-center gap-2 text-sm">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                    LinkedIn Profile
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="secondary">{status?.label}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Priority</span>
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: priority?.color }}
                >
                  {contact.priority}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span>{contact.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span>{contact.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PIC</span>
                <span>{contact.assignedTo?.name ?? "Unassigned"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(contact.createdAt).toLocaleDateString("vi-VN")}</span>
              </div>
              {contact.notes && (
                <div className="pt-2 border-t">
                  <p className="text-muted-foreground mb-1">Notes</p>
                  <p>{contact.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Action History */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Action History</CardTitle>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setShowAction(!showAction)}>
                  <Plus className="mr-1 h-4 w-4" /> Log Action
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {/* Add Action Form */}
              {showAction && (
                <form onSubmit={handleAddAction} className="mb-4 rounded-lg border p-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      value={actionForm.type}
                      onChange={(e) => setActionForm({ ...actionForm, type: e.target.value })}
                    >
                      {ACTION_TYPES.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                    <input
                      placeholder="Note (optional)"
                      className="rounded-md border bg-background px-3 py-2 text-sm outline-none"
                      value={actionForm.note}
                      onChange={(e) => setActionForm({ ...actionForm, note: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={savingAction}>
                      {savingAction ? "Saving..." : "Save"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowAction(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {/* Action List */}
              <div className="space-y-3">
                {contact.actions.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">No actions recorded yet</p>
                )}
                {contact.actions.map((action) => {
                  const actionType = ACTION_TYPES.find((a) => a.value === action.type);
                  return (
                    <div key={action.id} className="flex gap-3 rounded-lg border p-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{actionType?.label ?? action.type}</Badge>
                          <span className="text-xs text-muted-foreground">
                            by {action.performedBy.name}
                          </span>
                        </div>
                        {action.note && (
                          <p className="text-sm text-muted-foreground">{action.note}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(action.performedAt).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <ContactFormDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSaved={loadContact}
        editData={contact}
      />
    </div>
  );
}
