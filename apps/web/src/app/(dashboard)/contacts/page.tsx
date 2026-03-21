"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { CONTACT_STATUSES, INDUSTRIES, PRIORITIES } from "@xperise/shared";

interface Contact {
  id: string;
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  priority: number;
  contactStatus: string;
  type: string;
  company: { id: string; name: string; industry: string };
  assignedTo: { id: string; name: string } | null;
}

interface PaginatedResponse {
  data: Contact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  NO_CONTACT: "secondary",
  CONTACT: "outline",
  REACHED: "warning",
  FOLLOW_UP: "warning",
  MEETING_BOOKED: "default",
  CONVERTED: "success",
};

export default function ContactsPage() {
  const router = useRouter();
  const { canEdit } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  const loadContacts = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("contactStatus", statusFilter);
      if (industryFilter) params.set("industry", industryFilter);

      const res = await apiGet<PaginatedResponse>(`/contacts?${params}`);
      setContacts(res.data);
      setPagination({ page: res.pagination.page, total: res.pagination.total, totalPages: res.pagination.totalPages });
    } catch (err) {
      console.error("Failed to load contacts:", err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, industryFilter]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">{pagination.total} contacts total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/settings")}>
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Contact
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search name, email, company..."
                className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadContacts()}
              />
            </div>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {CONTACT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
            >
              <option value="">All Industries</option>
              {INDUSTRIES.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={() => loadContacts()}>
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Company</th>
                  <th className="px-4 py-3 text-left font-medium">Position</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Priority</th>
                  <th className="px-4 py-3 text-left font-medium">PIC</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No contacts found
                    </td>
                  </tr>
                ) : (
                  contacts.map((contact) => {
                    const status = CONTACT_STATUSES.find((s) => s.value === contact.contactStatus);
                    const priority = PRIORITIES.find((p) => p.value === contact.priority);
                    return (
                      <tr key={contact.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => router.push(`/contacts/${contact.id}`)}>
                        <td className="px-4 py-3 font-medium">{contact.fullName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{contact.company.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{contact.position ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{contact.email ?? "—"}</td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_COLORS[contact.contactStatus] ?? "secondary"}>
                            {status?.label ?? contact.contactStatus}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: priority?.color ?? "#6b7280" }}
                          >
                            {contact.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {contact.assignedTo?.name ?? "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => loadContacts(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadContacts(pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Contact Dialog */}
      <ContactFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => loadContacts()}
      />
    </div>
  );
}
