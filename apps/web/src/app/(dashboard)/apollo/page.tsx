"use client";

import { useState } from "react";
import {
  Search,
  Download,
  Sparkles,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiPost } from "@/lib/api";

interface ApolloOrg {
  id?: string;
  name: string;
  has_industry?: boolean;
  has_employee_count?: boolean;
  has_phone?: boolean;
  // Enrichment-only fields:
  website_url?: string | null;
  industry?: string | null;
  estimated_num_employees?: number | null;
  country?: string | null;
}

interface ApolloPerson {
  id: string;
  first_name: string;
  last_name_obfuscated: string | null;
  title: string | null;
  has_email: boolean;
  has_direct_phone: string | null;
  // Enrichment-only fields (not present in search results):
  last_name?: string;
  name?: string;
  email?: string | null;
  email_status?: string | null;
  linkedin_url?: string | null;
  phone_numbers?: Array<{ raw_number: string; type: string }>;
  organization?: ApolloOrg;
}

interface SearchResponse {
  people: ApolloPerson[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
}

interface ImportResult {
  companiesCreated: number;
  contactsCreated: number;
  contactsSkipped: number;
  errors: string[];
  enrichment?: {
    requested: number;
    enriched: number;
    missing: number;
    creditsConsumed: number;
    fieldsUpdated: number;
  };
}

const EMPLOYEE_RANGES = [
  { label: "1-10", value: "1,10" },
  { label: "11-50", value: "11,50" },
  { label: "51-200", value: "51,200" },
  { label: "201-500", value: "201,500" },
  { label: "501-1000", value: "501,1000" },
  { label: "1001-5000", value: "1001,5000" },
  { label: "5001+", value: "5001,10000" },
];

const INDUSTRIES = [
  "Banking",
  "Financial Services",
  "FMCG",
  "Consumer Goods",
  "Technology",
  "Information Technology",
  "Media",
  "Entertainment",
  "Healthcare",
  "Pharmaceutical",
  "Manufacturing",
  "Real Estate",
  "Retail",
  "Education",
  "Telecommunications",
];

const SENIORITIES = [
  { label: "C-Suite", value: "c_suite" },
  { label: "Founder", value: "founder" },
  { label: "VP", value: "vp" },
  { label: "Director", value: "director" },
  { label: "Head", value: "head" },
  { label: "Manager", value: "manager" },
  { label: "Individual Contributor", value: "individual_contributor" },
  { label: "Entry", value: "entry" },
];

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

export default function ApolloPage() {
  const [titles, setTitles] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [employeeRanges, setEmployeeRanges] = useState<string[]>([]);
  const [locations, setLocations] = useState("");
  const [seniorities, setSeniorities] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [orgName, setOrgName] = useState("");
  const [perPage, setPerPage] = useState(25);

  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [enrichOnImport, setEnrichOnImport] = useState(true);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  async function checkExisting(people: ApolloPerson[]) {
    if (people.length === 0) return;
    try {
      const payload = people.map((p) => ({
        id: p.id,
        email: p.email ?? null,
        name:
          [p.first_name, p.last_name || p.last_name_obfuscated]
            .filter(Boolean)
            .join(" ") || p.first_name,
        orgName: p.organization?.name,
      }));
      const res = await apiPost<{ existingIds: string[] }>(
        "/apollo/check-existing",
        { people: payload }
      );
      setExistingIds(new Set(res.existingIds));
    } catch {
      // Non-critical — silent fail, dedup check doesn't block search
    }
  }

  async function handleSearch(page = 1) {
    setError("");
    setImportResult(null);
    setSearching(true);
    setCurrentPage(page);
    setExistingIds(new Set());

    try {
      const filters: Record<string, unknown> = { page, perPage };

      if (titles.trim()) {
        filters.personTitles = titles.split(",").map((t) => t.trim()).filter(Boolean);
      }
      if (industries.length) {
        filters.organizationIndustries = industries;
      }
      if (employeeRanges.length) {
        filters.employeeRanges = employeeRanges;
      }
      if (locations.trim()) {
        filters.personLocations = locations.split(",").map((l) => l.trim()).filter(Boolean);
      }
      if (seniorities.length) {
        filters.personSeniorities = seniorities;
      }
      if (keywords.trim()) {
        filters.qKeywords = keywords.trim();
      }
      if (orgName.trim()) {
        filters.qOrganizationName = orgName.trim();
      }

      const res = await apiPost<SearchResponse>("/apollo/search", filters);
      setResults(res);
      setSelected(new Set());
      void checkExisting(res.people);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleImport() {
    if (selected.size === 0 || !results) return;
    setImporting(true);
    setError("");

    const people = results.people
      .filter((p) => selected.has(p.id))
      .map((p) => {
        const displayName = p.name
          || [p.first_name, p.last_name || p.last_name_obfuscated].filter(Boolean).join(" ")
          || p.first_name;
        return {
          apolloId: p.id,
          firstName: p.first_name,
          lastName: p.last_name ?? p.last_name_obfuscated ?? "",
          name: displayName,
          title: p.title ?? undefined,
          email: p.email ?? null,
          emailStatus: p.email_status ?? null,
          linkedinUrl: p.linkedin_url ?? null,
          phone: p.phone_numbers?.[0]?.raw_number ?? null,
          orgName: p.organization?.name,
          orgIndustry: p.organization?.industry ?? null,
          orgSize: p.organization?.estimated_num_employees ?? null,
          orgCountry: p.organization?.country ?? null,
          orgWebsite: p.organization?.website_url ?? null,
        };
      });

    try {
      const res = await apiPost<ImportResult>("/apollo/import", { people, enrich: enrichOnImport });
      setImportResult(res);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!results) return;
    const newIds = results.people
      .filter((p) => !existingIds.has(p.id))
      .map((p) => p.id);
    const allNewSelected = newIds.length > 0 && newIds.every((id) => selected.has(id));
    if (allNewSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(newIds));
    }
  }

  function toggleIndustry(ind: string) {
    setIndustries((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind]
    );
  }

  function toggleRange(range: string) {
    setEmployeeRanges((prev) =>
      prev.includes(range) ? prev.filter((r) => r !== range) : [...prev, range]
    );
  }

  function toggleSeniority(val: string) {
    setSeniorities((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Apollo.io Search</h1>
        <p className="text-muted-foreground">
          Tìm kiếm leads từ Apollo.io và import vào CRM
        </p>
      </div>

      {/* Search Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Filters</CardTitle>
          <CardDescription>
            Search không tốn credit. Chỉ Enrich mới tốn credit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Keywords */}
          <div>
            <label className="text-sm font-medium">Keywords</label>
            <input
              placeholder="SaaS, growth, B2B..."
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>

          {/* Org Name */}
          <div>
            <label className="text-sm font-medium">Company Name</label>
            <input
              placeholder="Google, VinGroup..."
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>

          {/* Titles */}
          <div>
            <label className="text-sm font-medium">
              Job Titles (comma-separated)
            </label>
            <input
              placeholder="CEO, Marketing Director, CTO..."
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
            />
          </div>

          {/* Industries */}
          <div>
            <label className="text-sm font-medium">Industries</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind}
                  type="button"
                  onClick={() => toggleIndustry(ind)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    industries.includes(ind)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {ind}
                </button>
              ))}
            </div>
          </div>

          {/* Employee Ranges */}
          <div>
            <label className="text-sm font-medium">Company Size</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {EMPLOYEE_RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => toggleRange(r.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    employeeRanges.includes(r.value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Locations */}
          <div>
            <label className="text-sm font-medium">
              Locations (comma-separated)
            </label>
            <input
              placeholder="Vietnam, Singapore, Thailand..."
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={locations}
              onChange={(e) => setLocations(e.target.value)}
            />
          </div>

          {/* Seniorities */}
          <div>
            <label className="text-sm font-medium">Seniority</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {SENIORITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleSeniority(s.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    seniorities.includes(s.value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Per Page + Search Button */}
          <div className="flex items-center gap-3">
            <Button onClick={() => handleSearch(1)} disabled={searching}>
              {searching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {searching ? "Searching..." : "Search Apollo.io"}
            </Button>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">
                Results per page:
              </label>
              <select
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <Badge variant="default" className="bg-green-600">
                Import Complete
              </Badge>
              <span>
                {importResult.contactsCreated} contacts created,{" "}
                {importResult.companiesCreated} companies created,{" "}
                {importResult.contactsSkipped} skipped
              </span>
            </div>
            {importResult.enrichment && importResult.enrichment.requested > 0 && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400">
                  Enrichment
                </Badge>
                <span>
                  {importResult.enrichment.enriched}/{importResult.enrichment.requested} enriched
                </span>
                {importResult.enrichment.fieldsUpdated > 0 && (
                  <span>{importResult.enrichment.fieldsUpdated} fields updated</span>
                )}
                {importResult.enrichment.creditsConsumed > 0 && (
                  <span className="text-amber-500">
                    {importResult.enrichment.creditsConsumed} credits used
                  </span>
                )}
                {importResult.enrichment.missing > 0 && (
                  <span className="text-muted-foreground">
                    {importResult.enrichment.missing} not found on Apollo
                  </span>
                )}
              </div>
            )}
            {importResult.errors.length > 0 && (
              <div className="space-y-1">
                {importResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive">
                    {err}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Results ({results.pagination.total_entries || results.people.length} found)
              </CardTitle>
              <CardDescription>
                Page {results.pagination.page} of{" "}
                {results.pagination.total_pages}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectAll}
              >
                {results.people
                  .filter((p) => !existingIds.has(p.id))
                  .every((p) => selected.has(p.id)) && results.people.some((p) => !existingIds.has(p.id)) ? (
                  <CheckSquare className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <Square className="mr-1 h-3.5 w-3.5" />
                )}
                {results.people
                  .filter((p) => !existingIds.has(p.id))
                  .every((p) => selected.has(p.id)) && results.people.some((p) => !existingIds.has(p.id))
                  ? "Deselect All"
                  : "Select All"}
              </Button>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enrichOnImport}
                  onChange={(e) => setEnrichOnImport(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Enrich (tốn credit)
                </span>
              </label>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={selected.size === 0 || importing}
              >
                {importing ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1 h-3.5 w-3.5" />
                )}
                Import ({selected.size})
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.people.map((person) => {
                const inCrm = existingIds.has(person.id);
                return (
                <div
                  key={person.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                    inCrm
                      ? "border-border/50 bg-muted/20 opacity-60"
                      : selected.has(person.id)
                      ? "border-primary/50 bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => !inCrm && toggleSelect(person.id)}
                >
                  {/* Checkbox */}
                  <div className="shrink-0">
                    {inCrm ? (
                      <UserCheck className="h-4 w-4 text-amber-500" />
                    ) : selected.has(person.id) ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Person Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {[person.first_name, person.last_name || person.last_name_obfuscated]
                          .filter(Boolean)
                          .join(" ") || "Unknown"}
                      </p>
                      {inCrm && (
                        <Badge className="text-[10px] shrink-0 border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/10">
                          In CRM
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {person.title}
                      {person.organization?.name &&
                        ` • ${person.organization.name}`}
                    </p>
                  </div>

                  {/* Right side badges + org indicators */}
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={person.has_email ? "default" : "outline"}
                        className="text-[10px]"
                      >
                        {person.has_email ? "Has Email" : "No Email"}
                      </Badge>
                      {person.has_direct_phone === "Yes" && (
                        <Badge className="text-[10px] bg-green-600 hover:bg-green-600">
                          Has Phone
                        </Badge>
                      )}
                    </div>
                    <div className="hidden lg:block text-xs text-right space-y-0.5">
                      {person.organization?.has_industry && (
                        <p className="text-muted-foreground">Has industry</p>
                      )}
                      {person.organization?.has_employee_count && (
                        <p className="text-muted-foreground">Has headcount</p>
                      )}
                    </div>
                  </div>

                  {/* LinkedIn (only available after enrichment) */}
                  {person.linkedin_url && (
                    <a
                      href={person.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                );
              })}
            </div>

            {/* Pagination */}
            {results.pagination.total_pages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage <= 1 || searching}
                  onClick={() => handleSearch(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentPage} / {results.pagination.total_pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    currentPage >= results.pagination.total_pages || searching
                  }
                  onClick={() => handleSearch(currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
