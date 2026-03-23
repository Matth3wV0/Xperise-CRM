"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Search, ChevronLeft, ChevronRight, Filter } from "lucide-react";
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
  source: string;
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

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  NO_CONTACT:     { bg: "bg-zinc-800/40", text: "text-zinc-400", dot: "bg-zinc-500" },
  CONTACT:        { bg: "bg-blue-950/40", text: "text-blue-400", dot: "bg-blue-500" },
  REACHED:        { bg: "bg-amber-950/40", text: "text-amber-400", dot: "bg-amber-500" },
  FOLLOW_UP:      { bg: "bg-orange-950/40", text: "text-orange-400", dot: "bg-orange-500" },
  MEETING_BOOKED: { bg: "bg-violet-950/40", text: "text-violet-400", dot: "bg-violet-500" },
  CONVERTED:      { bg: "bg-emerald-950/40", text: "text-emerald-400", dot: "bg-emerald-500" },
};

const PRIORITY_COLORS = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#6b7280"];

function StatusBadge({ status }: { status: string }) {
  const label = CONTACT_STATUSES.find((s) => s.value === status)?.label ?? status;
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.NO_CONTACT;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-secondary ${className ?? ""}`} />;
}

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
  const [currentPage, setCurrentPage] = useState(1);

  const loadContacts = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: "25" });
        if (search) params.set("search", search);
        if (statusFilter) params.set("contactStatus", statusFilter);
        if (industryFilter) params.set("industry", industryFilter);

        const res = await apiGet<PaginatedResponse>(`/contacts?${params}`);
        setContacts(res.data);
        setPagination({
          page: res.pagination.page,
          total: res.pagination.total,
          totalPages: res.pagination.totalPages,
        });
        setCurrentPage(page);
      } catch (err) {
        console.error("Failed to load contacts:", err);
      } finally {
        setLoading(false);
      }
    },
    [search, statusFilter, industryFilter]
  );

  useEffect(() => {
    loadContacts(1);
  }, [loadContacts]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? "Loading..." : `${pagination.total} contacts`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/settings")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          {canEdit && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Contact
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, email, company..."
            className="w-full rounded-lg border border-border bg-secondary py-2 pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadContacts(1)}
          />
        </div>

        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <select
          className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          {CONTACT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
        >
          <option value="">All Industries</option>
          {INDUSTRIES.map((i) => (
            <option key={i.value} value={i.value}>{i.label}</option>
          ))}
        </select>

        <button
          onClick={() => loadContacts(1)}
          className="rounded-lg bg-secondary border border-border px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          Search
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">Position</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground w-16">P</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden xl:table-cell">PIC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No contacts found</p>
                      <p className="text-xs text-muted-foreground/60">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground ring-1 ring-border">
                          {contact.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium truncate max-w-[160px]">{contact.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm truncate max-w-[140px]">
                      {contact.company.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm hidden md:table-cell truncate max-w-[140px]">
                      {contact.position ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm hidden lg:table-cell truncate max-w-[160px]">
                      {contact.email ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={contact.contactStatus} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: PRIORITY_COLORS[contact.priority] ?? "#6b7280" }}
                        title={PRIORITIES.find((p) => p.value === contact.priority)?.label}
                      >
                        {contact.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm hidden xl:table-cell">
                      {contact.assignedTo?.name ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 bg-secondary/30">
            <p className="text-xs text-muted-foreground">
              Page {currentPage} of {pagination.totalPages} &nbsp;·&nbsp; {pagination.total} contacts
            </p>
            <div className="flex items-center gap-1">
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                disabled={currentPage <= 1}
                onClick={() => loadContacts(currentPage - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                disabled={currentPage >= pagination.totalPages}
                onClick={() => loadContacts(currentPage + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <ContactFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => loadContacts(1)}
      />
    </div>
  );
}
