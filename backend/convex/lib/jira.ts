// Atlassian OAuth 2.0 (3LO) and Jira REST calls. Read-only: only GETs and the search POST.

export const JIRA_SCOPES = "read:jira-work read:jira-user offline_access";
export const SYNC_JQL = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
const SYNC_FIELDS = ["summary", "description", "status", "issuetype", "priority", "duedate", "timeoriginalestimate", "updated"];

export class JiraError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function env(name: "JIRA_CLIENT_ID" | "JIRA_CLIENT_SECRET" | "JIRA_REDIRECT_URI"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set on this Convex deployment.`);
  return value;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: env("JIRA_CLIENT_ID"),
    scope: JIRA_SCOPES,
    redirect_uri: env("JIRA_REDIRECT_URI"),
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `https://auth.atlassian.com/authorize?${params}`;
}

export type TokenSet = { accessToken: string; refreshToken: string; expiresAt: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env("JIRA_CLIENT_ID"), client_secret: env("JIRA_CLIENT_SECRET"), ...body }),
  });
  if (!res.ok) throw new JiraError(res.status, `Atlassian token endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!json.access_token || !json.refresh_token) {
    throw new JiraError(400, "Atlassian returned no refresh token (is offline_access granted?).");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

export function exchangeCode(code: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: env("JIRA_REDIRECT_URI") });
}

/** Refresh tokens rotate: the returned refreshToken replaces the old one. */
export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export type JiraSite = { id: string; name: string; url: string };

export async function accessibleSites(accessToken: string): Promise<JiraSite[]> {
  const res = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new JiraError(res.status, `accessible-resources ${res.status}`);
  const sites = (await res.json()) as { id: string; name: string; url: string; scopes?: string[] }[];
  return sites
    .filter((s) => !s.scopes || s.scopes.includes("read:jira-work"))
    .map(({ id, name, url }) => ({ id, name, url }));
}

export type JiraIssue = {
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    status?: { name?: string };
    issuetype?: { name?: string };
    priority?: { name?: string } | null;
    duedate?: string | null;
    updated?: string;
  };
};

/** One page of the user's open assigned issues. */
export async function searchPage(
  accessToken: string,
  cloudId: string,
  nextPageToken?: string,
): Promise<{ issues: JiraIssue[]; nextPageToken?: string }> {
  const res = await fetch(`https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3/search/jql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ jql: SYNC_JQL, fields: SYNC_FIELDS, maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) }),
  });
  if (!res.ok) throw new JiraError(res.status, `Jira search ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { issues?: JiraIssue[]; nextPageToken?: string; isLast?: boolean };
  return { issues: json.issues ?? [], nextPageToken: json.isLast ? undefined : json.nextPageToken };
}
