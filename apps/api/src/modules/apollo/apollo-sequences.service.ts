import pThrottle from "p-throttle";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

// Rate limit: 100 requests per 5 minutes (shared with apollo.service.ts)
const throttle = pThrottle({ limit: 90, interval: 5 * 60 * 1000 });

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY environment variable is required");
  return key;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ApolloSequence {
  id: string;
  name: string;
  active: boolean;
  num_steps: number;
  created_at: string;
}

export interface ApolloEmailMessage {
  id: string;
  emailer_campaign_id: string;
  contact_id: string;
  subject: string;
  body_text?: string;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  clicked_at: string | null;
  created_at: string;
  contact?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface ApolloEmailActivity {
  id: string;
  type: string; // "email_opened", "email_replied", "email_bounced", "email_clicked"
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const apolloPost = throttle(
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

const apolloGet = throttle(async (endpoint: string) => {
  const res = await fetch(`${APOLLO_BASE}${endpoint}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
    },
  });

  if (res.status === 429) {
    throw new Error("Apollo rate limit exceeded. Please wait and retry.");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo API error (${res.status}): ${text}`);
  }
  return res.json();
});

// ── Sequence Operations ────────────────────────────────────────────────────────

/**
 * Search for sequences in Apollo. Use to find/validate sequence IDs.
 */
export async function searchSequences(query?: string): Promise<{
  emailer_campaigns: ApolloSequence[];
}> {
  const body: Record<string, unknown> = { per_page: 50, page: 1 };
  if (query) body.q_keywords = query;
  return apolloPost("/emailer_campaigns/search", body);
}

/**
 * Add contact IDs to an existing Apollo sequence.
 * Contacts must already exist in Apollo (use createApolloContact first).
 * Requires Master API Key.
 */
export async function addContactsToSequence(
  sequenceId: string,
  contactIds: string[],
  emailAccountId?: string
): Promise<{ contacts: unknown[]; status?: string }> {
  const body: Record<string, unknown> = {
    contact_ids: contactIds,
  };
  if (emailAccountId) {
    body.emailer_campaign_id = sequenceId;
    body.send_email_from_email_account_id = emailAccountId;
  }
  return apolloPost(
    `/emailer_campaigns/${sequenceId}/add_contact_ids`,
    body
  );
}

/**
 * Activate a sequence (must have at least 1 step configured in Apollo UI).
 */
export async function activateSequence(
  sequenceId: string
): Promise<{ emailer_campaign: ApolloSequence }> {
  return apolloPost(`/emailer_campaigns/${sequenceId}/approve`, {});
}

/**
 * Remove or stop contacts from a sequence.
 */
export async function removeContactsFromSequence(
  sequenceId: string,
  contactIds: string[],
  action: "finish" | "remove" = "remove"
): Promise<unknown> {
  return apolloPost("/emailer_campaigns/remove_or_stop_contact_ids", {
    emailer_campaign_id: sequenceId,
    contact_ids: contactIds,
    ...(action === "finish" ? { mark_as_finished: true } : {}),
  });
}

// ── Contact Operations ─────────────────────────────────────────────────────────

/**
 * Create a contact in Apollo. Required before adding to a sequence.
 * Returns Apollo contact ID.
 */
export async function createApolloContact(params: {
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
  organizationName?: string;
  linkedinUrl?: string;
  phone?: string;
}): Promise<{ contact: { id: string } }> {
  const body: Record<string, unknown> = {
    first_name: params.firstName,
    last_name: params.lastName,
  };
  if (params.email) body.email = params.email;
  if (params.title) body.title = params.title;
  if (params.organizationName) body.organization_name = params.organizationName;
  if (params.linkedinUrl) body.linkedin_url = params.linkedinUrl;
  if (params.phone) body.phone_number = params.phone;

  return apolloPost("/contacts", body);
}

// ── Email Stats Operations ─────────────────────────────────────────────────────

/**
 * Search for outreach emails sent from a specific sequence.
 * Use for polling email status (no webhooks available from Apollo).
 * Returns up to 100 per page (max 500 pages = 50K records).
 */
export async function searchOutreachEmails(params: {
  sequenceId?: string;
  page?: number;
  perPage?: number;
}): Promise<{
  emailer_messages: ApolloEmailMessage[];
  pagination: { page: number; per_page: number; total_entries: number; total_pages: number };
}> {
  const searchParams = new URLSearchParams();
  if (params.sequenceId)
    searchParams.set("emailer_campaign_id", params.sequenceId);
  searchParams.set("page", String(params.page ?? 1));
  searchParams.set("per_page", String(params.perPage ?? 100));

  return apolloGet(`/emailer_messages/search?${searchParams.toString()}`);
}

/**
 * Get detailed activities (opens, clicks, replies) for a specific email.
 */
export async function getEmailActivities(
  emailMessageId: string
): Promise<{
  emailer_message: ApolloEmailMessage;
  activities: ApolloEmailActivity[];
}> {
  return apolloGet(`/emailer_messages/${emailMessageId}/activities`);
}

/**
 * Get linked email accounts (mailboxes) for the Apollo team.
 * Needed for `send_email_from_email_account_id` when adding contacts to sequence.
 */
export async function getEmailAccounts(): Promise<{
  email_accounts: Array<{
    id: string;
    email: string;
    type: string;
    active: boolean;
  }>;
}> {
  return apolloGet("/email_accounts");
}
