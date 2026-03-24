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
  perPage?: number;
  page?: number;
}

export interface ApolloPersonResult {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  email: string | null;
  email_status: string | null;
  linkedin_url: string | null;
  phone_numbers?: Array<{ raw_number: string; type: string }>;
  organization?: {
    id: string;
    name: string;
    website_url: string | null;
    industry: string | null;
    estimated_num_employees: number | null;
    country: string | null;
  };
}

export interface ApolloSearchResponse {
  people: ApolloPersonResult[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
}

export interface ApolloEnrichResponse {
  person: ApolloPersonResult | null;
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

  return apolloFetch("/mixed_people/api_search", body);
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
