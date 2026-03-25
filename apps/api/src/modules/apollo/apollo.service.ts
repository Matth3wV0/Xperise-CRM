import pThrottle from "p-throttle";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

// Rate limit: 100 requests per 5 minutes
const throttle = pThrottle({ limit: 95, interval: 5 * 60 * 1000 });

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY environment variable is required");
  return key;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ApolloSearchFilters {
  personTitles?: string[];
  organizationIndustries?: string[];
  employeeRanges?: string[];
  personLocations?: string[];
  personSeniorities?: string[];
  qKeywords?: string;
  qOrganizationName?: string;
  perPage?: number;
  page?: number;
}

// Returned by mixed_people/api_search (search/discovery — no credits)
// Last name and org details are obfuscated; use people/match to enrich
export interface ApolloPersonResult {
  id: string;
  first_name: string;
  last_name_obfuscated: string | null; // e.g. "Jo**s" — full name requires enrichment
  title: string | null;
  last_refreshed_at: string | null;
  has_email: boolean;
  has_direct_phone: string | null; // "Yes" | "Maybe: ..." | null
  has_city: boolean;
  has_state: boolean;
  has_country: boolean;
  // Fields only present after enrichment via people/match:
  last_name?: string;
  name?: string;
  email?: string | null;
  email_status?: string | null;
  linkedin_url?: string | null;
  phone_numbers?: Array<{ raw_number: string; type: string }>;
  organization?: {
    id?: string;
    name: string;
    // has_* booleans from search; full fields from enrichment
    has_industry?: boolean;
    has_phone?: boolean;
    has_employee_count?: boolean;
    has_revenue?: boolean;
    has_city?: boolean;
    has_state?: boolean;
    has_country?: boolean;
    // Enrichment fields:
    website_url?: string | null;
    industry?: string | null;
    estimated_num_employees?: number | null;
    country?: string | null;
  };
}

export interface ApolloPagination {
  page: number;
  per_page: number;
  total_entries: number;
  total_pages: number;
}

export interface ApolloSearchResponse {
  people: ApolloPersonResult[];
  // Apollo may return pagination nested OR at the top level
  pagination?: ApolloPagination;
  page?: number;
  per_page?: number;
  total_entries?: number;
  total_pages?: number;
}

export interface ApolloEnrichResponse {
  person: ApolloPersonResult | null;
}

export interface BulkEnrichResponse {
  status: string;
  error_code: string | null;
  error_message: string | null;
  total_requested_enrichments: number;
  unique_enriched_records: number;
  missing_records: number;
  credits_consumed: number;
  matches: ApolloPersonResult[];
}

// ── API Calls ──────────────────────────────────────────────────────────────────

const apolloFetch = throttle(
  async (endpoint: string, body: Record<string, unknown>) => {
    const res = await fetch(`${APOLLO_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getApiKey(),
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      throw new Error("Apollo rate limit exceeded. Please wait and retry.");
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apollo API error (${res.status}): ${text}`);
    }

    return res.json();
  }
);

/**
 * Search people on Apollo.io (no credit cost).
 * Uses the new `mixed_people/api_search` endpoint.
 */
export async function searchPeople(
  filters: ApolloSearchFilters
): Promise<ApolloSearchResponse> {
  const body: Record<string, unknown> = {
    per_page: filters.perPage ?? 25,
    page: filters.page ?? 1,
  };

  if (filters.personTitles?.length) {
    body.person_titles = filters.personTitles;
  }
  if (filters.organizationIndustries?.length) {
    body.organization_industries = filters.organizationIndustries.map((i) =>
      i.toLowerCase()
    );
  }
  if (filters.employeeRanges?.length) {
    body.organization_num_employees_ranges = filters.employeeRanges;
  }
  if (filters.personLocations?.length) {
    body.person_locations = filters.personLocations;
  }
  if (filters.personSeniorities?.length) {
    body.person_seniorities = filters.personSeniorities;
  }
  if (filters.qKeywords?.trim()) {
    body.q_keywords = filters.qKeywords.trim();
  }
  if (filters.qOrganizationName?.trim()) {
    body.q_organization_name = filters.qOrganizationName.trim();
  }

  const raw = await apolloFetch("/mixed_people/api_search", body);
  // Debug: log raw pagination fields to identify Apollo's response structure
  console.log("[Apollo] raw pagination:", {
    nested: raw.pagination,
    top: { page: raw.page, per_page: raw.per_page, total_entries: raw.total_entries, total_pages: raw.total_pages },
    people_count: raw.people?.length,
  });
  return raw;
}

/**
 * Enrich a person by name + organization (costs 1 credit per match).
 * Uses the `people/match` endpoint.
 */
export async function enrichPerson(params: {
  firstName?: string;
  lastName?: string;
  organizationName?: string;
  email?: string;
  linkedinUrl?: string;
}): Promise<ApolloEnrichResponse> {
  const body: Record<string, unknown> = {};

  if (params.firstName) body.first_name = params.firstName;
  if (params.lastName) body.last_name = params.lastName;
  if (params.organizationName) body.organization_name = params.organizationName;
  if (params.email) body.email = params.email;
  if (params.linkedinUrl) body.linkedin_url = params.linkedinUrl;

  return apolloFetch("/people/match", body);
}

/**
 * Bulk enrich up to 10 people at once (costs 1 credit per match).
 * Uses the `/people/bulk_match` endpoint.
 * @see https://docs.apollo.io/reference/bulk-people-enrichment
 */
export async function bulkEnrichPeople(
  details: Array<{
    id?: string;
    first_name?: string;
    last_name?: string;
    name?: string;
    email?: string;
    organization_name?: string;
    domain?: string;
    linkedin_url?: string;
  }>
): Promise<BulkEnrichResponse> {
  if (details.length === 0) {
    return {
      status: "success",
      error_code: null,
      error_message: null,
      total_requested_enrichments: 0,
      unique_enriched_records: 0,
      missing_records: 0,
      credits_consumed: 0,
      matches: [],
    };
  }
  if (details.length > 10) {
    throw new Error("Bulk enrich supports max 10 people per request");
  }
  return apolloFetch("/people/bulk_match", { details });
}
