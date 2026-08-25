import type { LinearIssue, LinearTeam } from "./contracts.shared";
import type { LinearTodoConfig } from "./config";
import { DEFAULT_PROMPT_TEMPLATE } from "./prompt.shared";

const API_URL = "https://api.linear.app/graphql";

export class LinearError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LinearError";
  }
}

interface ListQueryResult {
  teams?: { nodes: Array<{ id: string; key: string; name: string }> };
  issues?: { nodes: RawIssue[] };
}

interface RawIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url: string;
  priority: number;
  updatedAt: string;
  assignee?: { id: string; name: string } | null;
  labels?: { nodes: Array<{ name: string }> };
  state: { id: string; name: string; type: string };
  team: { id: string; key: string };
  comments?: {
    nodes: Array<{ body: string; user?: { name: string } | null; createdAt: string }>;
  };
}

async function rawQuery<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json().catch(() => null)) as
    | { data?: T; errors?: Array<{ message: string }> }
    | null;
  if (!res.ok || body?.errors?.length) {
    const message = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new LinearError(`Linear API error: ${message}`, res.status);
  }
  if (!body?.data) {
    throw new LinearError(`Linear API returned no data (HTTP ${res.status})`, res.status);
  }
  return body.data;
}

function buildIssueFilter(config: LinearTodoConfig, viewerId: string | null): string {
  const parts: string[] = [];
  if (config.teamKeys?.length) {
    const keys = config.teamKeys.map((k) => JSON.stringify(k)).join(", ");
    parts.push(`team: { key: { in: [${keys}] } }`);
  }
  if (config.statusNames?.length) {
    const names = config.statusNames.map((n) => JSON.stringify(n)).join(", ");
    parts.push(`state: { name: { in: [${names}] } }`);
  } else {
    parts.push('state: { type: { eq: "unstarted" } }');
  }
  const assignee = config.assignee ?? "any";
  if (assignee === "unassigned") {
    parts.push("assignee: { null: true }");
  } else if (assignee === "me" && viewerId) {
    parts.push(`assignee: { id: { eq: ${JSON.stringify(viewerId)} } }`);
  }
  return parts.join(", ");
}

const PRIORITY_RANK: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3 };

function rankPriority(priority: number): number {
  return PRIORITY_RANK[priority] ?? 4; // 0 (no priority) and unknowns sort last
}

async function fetchViewerId(token: string): Promise<string | null> {
  const data = await rawQuery<{ viewer?: { id: string } | null }>(
    token,
    `query ViewerId { viewer { id } }`,
  );
  return data.viewer?.id ?? null;
}

interface ListCacheEntry {
  payload: {
    issues: LinearIssue[];
    teams: LinearTeam[];
    fetchedAt: string;
    moveToStarted: boolean;
    promptTemplate: string;
  };
  at: number;
}

const LIST_CACHE_TTL_MS = 15_000;
let listCache: { key: string; entry: ListCacheEntry } | null = null;

const startedStateCache = new Map<string, string>();

function configCacheKey(config: LinearTodoConfig, token: string): string {
  return JSON.stringify([
    token,
    config.teamKeys ?? null,
    config.statusNames ?? null,
    config.assignee ?? "any",
    config.limit ?? 50,
    config.moveToStarted ?? true,
    config.promptTemplate ?? null,
  ]);
}

export async function listTodo(
  config: LinearTodoConfig,
  refresh = false,
): Promise<{
  issues: LinearIssue[];
  teams: LinearTeam[];
  fetchedAt: string;
  moveToStarted: boolean;
  promptTemplate: string;
}> {
  const token = config.apiToken ?? process.env.LINEAR_API_TOKEN;
  if (!token) throw new LinearError("No Linear API token configured", 401);

  const key = configCacheKey(config, token);
  if (!refresh && listCache && listCache.key === key) {
    const age = Date.now() - listCache.entry.at;
    if (age < LIST_CACHE_TTL_MS) {
      return listCache.entry.payload;
    }
  }

  const limit = Math.min(config.limit ?? 50, 200);
  const assignee = config.assignee ?? "any";
  let viewerId: string | null = null;
  if (assignee === "me") {
    viewerId = await fetchViewerId(token);
    if (!viewerId) {
      throw new LinearError("Could not resolve Linear viewer for assignee filter", 401);
    }
  }

  const filter = buildIssueFilter(config, viewerId);
  const data = await rawQuery<ListQueryResult>(
    token,
    `query ListTodo($limit: Int!) {
      teams { nodes { id key name } }
      issues(filter: { ${filter} }, orderBy: updatedAt, first: $limit) {
        nodes {
          id identifier title description url priority updatedAt
          assignee { id name }
          labels { nodes { name } }
          state { id name type }
          team { id key }
          comments(first: 10) { nodes { body user { name } createdAt } }
        }
      }
    }`,
    { limit },
  );

  const issues: LinearIssue[] = (data.issues?.nodes ?? [])
    .sort((a, b) => {
      const pa = rankPriority(a.priority);
      const pb = rankPriority(b.priority);
      if (pa !== pb) return pa - pb;
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, limit)
    .map((i) => ({
      id: i.id,
      identifier: i.identifier,
      title: i.title,
      description: i.description ?? null,
      url: i.url,
      priority: i.priority,
      updatedAt: i.updatedAt,
      assignee: i.assignee ?? null,
      labels: (i.labels?.nodes ?? []).map((l) => l.name),
      state: i.state,
      team: i.team,
      comments: (i.comments?.nodes ?? []).map((c) => ({
        body: c.body,
        user: c.user?.name ?? null,
        createdAt: c.createdAt,
      })),
    }));

  const teams: LinearTeam[] = (data.teams?.nodes ?? []).map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
  }));

  const payload = {
    issues,
    teams,
    fetchedAt: new Date().toISOString(),
    moveToStarted: config.moveToStarted ?? true,
    promptTemplate: config.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE,
  };
  listCache = { key, entry: { payload, at: Date.now() } };
  return payload;
}

async function startedStateId(token: string, teamId: string): Promise<string | null> {
  const cached = startedStateCache.get(teamId);
  if (cached) return cached;

  const data = await rawQuery<{ team?: { states?: { nodes: Array<{ id: string; type: string }> } } | null }>(
    token,
    `query TeamStates($teamId: String!) {
      team(id: $teamId) { states { nodes { id type } } }
    }`,
    { teamId },
  );
  const started = (data.team?.states?.nodes ?? []).find((s) => s.type === "started");
  if (started) startedStateCache.set(teamId, started.id);
  return started?.id ?? null;
}

export async function startIssue(
  config: LinearTodoConfig,
  teamId: string,
  issueId: string,
): Promise<boolean> {
  const token = config.apiToken ?? process.env.LINEAR_API_TOKEN;
  if (!token) throw new LinearError("No Linear API token configured", 401);

  const stateId = await startedStateId(token, teamId);
  if (!stateId) return false;

  const data = await rawQuery<{ issueUpdate?: { success: boolean } }>(
    token,
    `mutation StartIssue($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
    }`,
    { issueId, stateId },
  );
  const success = Boolean(data.issueUpdate?.success);
  if (!success) {
    startedStateCache.delete(teamId);
  }
  return success;
}

export async function addComment(
  config: LinearTodoConfig,
  issueId: string,
  body: string,
): Promise<boolean> {
  const token = config.apiToken ?? process.env.LINEAR_API_TOKEN;
  if (!token) throw new LinearError("No Linear API token configured", 401);

  const data = await rawQuery<{ commentCreate?: { success: boolean } }>(
    token,
    `mutation CommentOnIssue($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }`,
    { issueId, body },
  );
  return Boolean(data.commentCreate?.success);
}
