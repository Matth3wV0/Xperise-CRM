"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Building2, Users, TrendingUp } from "lucide-react";
import { apiGet } from "@/lib/api";
import { INDUSTRIES } from "@xperise/shared";

interface Company {
  id: string;
  name: string;
  industry: string;
  country: string | null;
  size: string | null;
  fitScore: number | null;
  website: string | null;
  _count: { contacts: number; pipelines: number };
}

const INDUSTRY_STYLES: Record<string, { bg: string; text: string }> = {
  BANK:              { bg: "bg-blue-950/60", text: "text-blue-400" },
  FMCG:             { bg: "bg-amber-950/60", text: "text-amber-400" },
  MEDIA:            { bg: "bg-violet-950/60", text: "text-violet-400" },
  CONGLOMERATE:     { bg: "bg-indigo-950/60", text: "text-indigo-400" },
  TECH_DURABLE:     { bg: "bg-sky-950/60", text: "text-sky-400" },
  PHARMA_HEALTHCARE:{ bg: "bg-emerald-950/60", text: "text-emerald-400" },
  MANUFACTURING:    { bg: "bg-orange-950/60", text: "text-orange-400" },
  OTHERS:           { bg: "bg-zinc-800/60", text: "text-zinc-400" },
};

function FitDots({ score }: { score: number | null }) {
  if (!score) return null;
  return (
    <div className="flex items-center gap-0.5" title={`Fit score: ${score}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < score ? "bg-primary" : "bg-secondary"}`}
        />
      ))}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-secondary ${className ?? ""}`} />;
}

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", sortBy: "name", sortOrder: "asc" });
      if (search) params.set("search", search);
      if (industryFilter) params.set("industry", industryFilter);
      const res = await apiGet<{ data: Company[] }>(`/companies?${params}`);
      setCompanies(res.data);
    } catch (err) {
      console.error("Failed to load companies:", err);
    } finally {
      setLoading(false);
    }
  }, [search, industryFilter]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? "Loading..." : `${companies.length} companies`}
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
          <Plus className="h-3.5 w-3.5" />
          Add Company
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search companies..."
            className="w-full rounded-lg border border-border bg-secondary py-2 pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadCompanies()}
          />
        </div>

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
          onClick={() => loadCompanies()}
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Industry</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">Size</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Country</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contacts</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deals</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden xl:table-cell">Fit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No companies found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                companies.map((company) => {
                  const industryInfo = INDUSTRIES.find((i) => i.value === company.industry);
                  const indStyle = INDUSTRY_STYLES[company.industry] ?? INDUSTRY_STYLES.OTHERS;
                  return (
                    <tr
                      key={company.id}
                      className="hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/companies/${company.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary border border-border">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-semibold">{company.name}</p>
                            {company.website && (
                              <a
                                href={company.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block max-w-[200px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {company.website.replace(/^https?:\/\//, "")}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${indStyle.bg} ${indStyle.text}`}>
                          {industryInfo?.label ?? company.industry}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm hidden md:table-cell">
                        {company.size ?? <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm hidden lg:table-cell">
                        {company.country ?? <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-1 text-sm">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{company._count.contacts}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-1 text-sm">
                          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{company._count.pipelines}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <FitDots score={company.fitScore} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
