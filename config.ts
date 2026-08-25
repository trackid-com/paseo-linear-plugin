import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface LinearTodoConfig {
  apiToken?: string;
  teamKeys?: string[];
  statusNames?: string[];
  assignee?: "any" | "me" | "unassigned";
  limit?: number;
  moveToStarted?: boolean;
  promptTemplate?: string;
}

export interface ConfigLoadResult {
  config: LinearTodoConfig;
  error?: string;
}

function configDir(): string {
  return path.join(
    process.env.PASEO_HOME ?? path.join(os.homedir(), ".paseo"),
    "plugins",
    "linear-todo",
  );
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

const ALLOWED_ASSIGNEE = new Set(["any", "me", "unassigned"]);

function sanitize(value: unknown): LinearTodoConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  const config: LinearTodoConfig = {};

  if (typeof raw.apiToken === "string" && raw.apiToken.length > 0) {
    config.apiToken = raw.apiToken;
  }
  if (
    Array.isArray(raw.teamKeys) &&
    raw.teamKeys.every((k) => typeof k === "string" && k.length > 0)
  ) {
    config.teamKeys = raw.teamKeys as string[];
  }
  if (
    Array.isArray(raw.statusNames) &&
    raw.statusNames.every((n) => typeof n === "string" && n.length > 0)
  ) {
    config.statusNames = raw.statusNames as string[];
  }
  if (typeof raw.assignee === "string" && ALLOWED_ASSIGNEE.has(raw.assignee)) {
    config.assignee = raw.assignee as LinearTodoConfig["assignee"];
  }
  if (
    typeof raw.limit === "number" &&
    Number.isFinite(raw.limit) &&
    raw.limit > 0
  ) {
    config.limit = Math.min(Math.floor(raw.limit), 200);
  }
  if (typeof raw.moveToStarted === "boolean") {
    config.moveToStarted = raw.moveToStarted;
  }
  if (typeof raw.promptTemplate === "string" && raw.promptTemplate.length > 0) {
    config.promptTemplate = raw.promptTemplate;
  }

  return config;
}

const SHAPE = `{
  "apiToken": "lin_api_…",          // or LINEAR_API_TOKEN in the daemon env
  "teamKeys": ["ENG"],              // omit → every team the token can see
  "statusNames": ["Todo"],          // optional; omit → state type "unstarted"
  "assignee": "any",                // "any" | "me" | "unassigned"
  "limit": 50,
  "moveToStarted": true,
  "promptTemplate": "…"             // optional, overrides the built-in
}`;

export function loadConfig(): ConfigLoadResult {
  const path = configPath();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    const reason = existsSync(path)
      ? `not valid JSON (${(e as Error).message})`
      : "file not found";
    return {
      config: {},
      error: `No Linear config at ${path} (${reason}). Create it with this shape:\n${SHAPE}\nchmod 600 the file.`,
    };
  }

  const config = sanitize(parsed);
  const hasToken = Boolean(config.apiToken ?? process.env.LINEAR_API_TOKEN);
  if (!hasToken) {
    return {
      config,
      error: `config.json is missing an apiToken (and LINEAR_API_TOKEN is not set in the daemon env). Add it:\n${SHAPE}`,
    };
  }
  return { config };
}
