/**
 * Lightweight Apollo.io search client for the Telegram bot.
 * Only implements People Search (free, no credit cost).
 * Rate limiting is not needed here — /find is a manual one-at-a-time command.
 */

const APOLLO_BASE = "https://api.apollo.io/api/v1";

export interface ApolloPersonResult {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  email_status: string | null;
  linkedin_url: string | null;
  organization?: {
    name: string;
    industry: string | null;
    estimated_num_employees: number | null;
    country: string | null;
  };
}

export interface ApolloSearchResult {
  people: ApolloPersonResult[];
  total: number;
}

// Known industry keywords → Apollo industry filter values
const INDUSTRY_KEYWORDS: Record<string, string> = {
  bank: "banking",
  banking: "banking",
  fmcg: "consumer goods",
  media: "media",
  pharma: "pharmaceutical",
  healthcare: "healthcare",
  manufacturing: "manufacturing",
  conglomerate: "conglomerate",
  tech: "information technology",
};

// Known location keywords → Apollo location values
const LOCATION_KEYWORDS: Record<string, string> = {
  vietnam: "Vietnam",
  viet: "Vietnam",
  hcm: "Ho Chi Minh City, Vietnam",
  hanoi: "Hanoi, Vietnam",
  singapore: "Singapore",
  thailand: "Thailand",
  indonesia: "Indonesia",
  malaysia: "Malaysia",
};

export interface ParsedFindQuery {
  personTitles: string[];
  organizationIndustries: string[];
  personLocations: string[];
  raw: string;
}

/**
 * Parse a natural-language /find query into Apollo filters.
 * Strategy: extract known industry/location keywords, rest becomes title.
 * Examples:
 *   "CFO Banking Vietnam" → title=CFO, industry=banking, location=Vietnam
 *   "CHRO FMCG" → title=CHRO, industry=consumer goods
 *   "Head of Finance" → title=Head of Finance
 */
export function parseFindQuery(query: string): ParsedFindQuery {
  const words = query.trim().split(/\s+/);
  const industries: string[] = [];
  const locations: string[] = [];
  const titleWords: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (INDUSTRY_KEYWORDS[lower]) {
      industries.push(INDUSTRY_KEYWORDS[lower]);
    } else if (LOCATION_KEYWORDS[lower]) {
      locations.push(LOCATION_KEYWORDS[lower]);
    } else {
      titleWords.push(word);
    }
  }

  // Default location to Vietnam if none specified
  if (locations.length === 0) {
    locations.push("Vietnam");
  }

  const title = titleWords.join(" ");

  return {
    personTitles: title ? [title] : [],
    organizationIndustries: industries,
    personLocations: locations,
    raw: query,
  };
}

/**
 * Call Apollo People Search (free, no credits used).
 * Returns up to 10 results.
 */
export async function searchApolloLeads(
  query: ParsedFindQuery
): Promise<ApolloSearchResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error("APOLLO_API_KEY not set");

  const body: Record<string, unknown> = {
    per_page: 10,
    page: 1,
  };

  if (query.personTitles.length > 0) {
    body.person_titles = query.personTitles;
  }
  if (query.organizationIndustries.length > 0) {
    body.organization_industries = query.organizationIndustries;
  }
  if (query.personLocations.length > 0) {
    body.person_locations = query.personLocations;
  }

  const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Accept": "application/json; charset=utf-8",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    throw new Error("Apollo rate limit exceeded. Thử lại sau.");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo API error (${res.status}): ${text}`);
  }

  const data = await res.json() as { people?: ApolloPersonResult[]; pagination?: { total_entries?: number } };
  return {
    people: data.people ?? [],
    total: data.pagination?.total_entries ?? 0,
  };
}
