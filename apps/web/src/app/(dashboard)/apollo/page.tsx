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
  id: string;
  name: string;
  website_url: string | null;
  industry: string | null;
  estimated_num_employees: number | null;
  country: string | null;
}

interface ApolloPerson {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  email: string | null;
  email_status: string | null;
  linkedin_url: string | null;
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

export default function ApolloPage() {
  const [titles, setTitles] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [employeeRanges, setEmployeeRanges] = useState<string[]>([]);
  const [locations, setLocations] = useState("");

  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  async function handleSearch(page = 1) {
    setError("");
    setImportResult(null);
    setSearching(true);
    setCurrentPage(page);

    try {
      const filters: Record<string, unknown> = { page, perPage: 25 };

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

      const res = await apiPost<SearchResponse>("/apollo/search", filters);
      setResults(res);
      setSelected(new Set());
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
      .map((p) => ({
        apolloId: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        name: p.name,
        title: p.title ?? undefined,
        email: p.email,
        emailStatus: p.email_status,
        linkedinUrl: p.linkedin_url,
        phone: p.phone_numbers?.[0]?.raw_number ?? null,
        orgName: p.organization?.name,
        orgIndustry: p.organization?.industry,
        orgSize: p.organization?.estimated_num_employees,
        orgCountry: p.organization?.country,
        orgWebsite: p.organization?.website_url,
      }));

    try {
      const res = await apiPost<ImportResult>("/apollo/import", { people });
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
    if (selected.size === results.people.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.people.map((p) => p.id)));
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

  const emailStatusColor = (status: string | null) => {
    if (!status) return "outline";
    if (status === "verified" || status === "valid") return "default";
    if (status === "invalid") return "destructive";
    return "secondary";
  };

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

          {/* Search Button */}
          <Button onClick={() => handleSearch(1)} disabled={searching}>
            {searching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            {searching ? "Searching..." : "Search Apollo.io"}
          </Button>
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
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="default" className="bg-green-600">
                Import Complete
              </Badge>
              <span>
                {importResult.contactsCreated} contacts created,{" "}
                {importResult.companiesCreated} companies created,{" "}
                {importResult.contactsSkipped} skipped
              </span>
            </div>
            {importResult.errors.length > 0 && (
              <div className="mt-2 space-y-1">
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
                {selected.size === results.people.length ? (
                  <CheckSquare className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <Square className="mr-1 h-3.5 w-3.5" />
                )}
                {selected.size === results.people.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
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
              {results.people.map((person) => (
                <div
                  key={person.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                    selected.has(person.id)
                      ? "border-primary/50 bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => toggleSelect(person.id)}
                >
                  {/* Checkbox */}
                  <div className="shrink-0">
                    {selected.has(person.id) ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Person Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {person.name ||
                          [person.first_name, person.last_name]
                            .filter(Boolean)
                            .join(" ") ||
                          "Unknown"}
                      </p>
                      {person.email_status && (
                        <Badge
                          variant={
                            emailStatusColor(person.email_status) as any
                          }
                          className="text-[10px]"
                        >
                          {person.email_status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {person.title}
                      {person.organization?.name &&
                        ` • ${person.organization.name}`}
                    </p>
                  </div>

                  {/* Email */}
                  <div className="hidden md:block text-xs text-muted-foreground truncate max-w-[200px]">
                    {person.email ?? "No email"}
                  </div>

                  {/* Company Info */}
                  <div className="hidden lg:block">
                    <div className="text-xs text-right">
                      <p className="text-muted-foreground">
                        {person.organization?.industry ?? "-"}
                      </p>
                      <p className="text-muted-foreground">
                        {person.organization?.estimated_num_employees
                          ? `${person.organization.estimated_num_employees} employees`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {/* LinkedIn */}
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
              ))}
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
