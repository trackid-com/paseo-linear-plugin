# paseo-linear-todo

Turn a Linear workspace's Todo column into a Paseo workspace panel, and
"I'll take this one" into a single click that spawns an agent in a fresh git
worktree, primed with the issue, with Linear updated to match.

**Experimental.** Paseo's plugin API is explicitly not designed for
distribution yet — expect breaking changes. Keep the surface small.

## Install

```sh
git clone <this repo>
cd paseo-linear-todo
npm install
paseo plugin install .       # runs `paseo plugin reload` afterwards
```

Requires Paseo plugins to be enabled (`pluginsEnabled: true` in
`~/.paseo/config.json`) and at least one provider configured in Paseo.

## Configure

Create `~/.paseo/plugins/linear-todo/config.json`:

```jsonc
{
  "apiToken": "lin_api_…",   // your Linear personal API key
  "teamKeys": ["ENG"],       // omit → every team the token can see
  "statusNames": ["Todo"],   // optional; omit → state type "unstarted"
  "assignee": "any",         // "any" | "me" | "unassigned"
  "limit": 50,
  "moveToStarted": true,
  "promptTemplate": "…"      // optional, overrides the built-in
}
```

`chmod 600` the file. Alternatively set `LINEAR_API_TOKEN` in the daemon's
environment and omit `apiToken` entirely.

Missing or invalid config is not a crash: the panel renders an empty state
with the exact path and shape.

### Getting a Linear API key

Linear → Settings → My account → Security → **Personal API keys** → Create.

## Use

1. Open the workspace panel: **⌘K → "Linear todo"**.
2. The panel lists the configured team(s)' Todo column — unstarted issues,
   priority first, then recently updated. Tap the ↗ on a row to open the issue
   in Linear.
3. Tap a row to open the hand-off sheet:
   - **Prompt** — pre-filled from the issue (identifier, title, description,
     comments), fully editable before starting.
   - **Model** — pick any enabled provider model; defaults to Paseo's default.
   - **New git worktree** — (default on) the agent starts in a fresh git
     worktree on a `linear/<identifier>` branch.
   - **Move to In Progress** — (default on, from config) flips the issue to the
     team's started state and posts a "picked up in Paseo" comment.
4. **Start agent.** A new agent appears in Paseo with the issue as its first
   message. The Linear write-back runs after the agent spawns, so a failed
   Linear update never costs you the hand-off — it just shows a toast.

The list refreshes on mount, on manual ↻, and every 60s while the panel is
visible.

## Default prompt template

```
Work on {{identifier}}: {{title}}
{{url}}

## Description
{{description}}

## Comments
{{comments}}

Follow this repo's conventions (CLAUDE.md / AGENTS.md if present).
Plan before you code.
```

Overridable via `promptTemplate` in config. Available placeholders:
`{{identifier}}`, `{{title}}`, `{{url}}`, `{{description}}`, `{{comments}}`.

## How it works

- **Read:** one GraphQL query — `issues(filter: { team: { key: { in } },
  state: { type: { eq: "unstarted" } } })` (or `statusNames`). The backend
  caches the result ~15s so the desktop app, a re-mount, and a phone don't
  triple the API calls.
- **Write-back:** `issueUpdate(stateId:)` targeting the team's first workflow
  state of type `started`, plus `commentCreate`. Runs server-side; the token
  never crosses into a client file.

## Non-goals

No issue creation/editing/closing, no sub-issues or attachments, no status
transitions after hand-off (the agent's PR flow owns In Review → Done), no
multi-workspace/multi-token support, no marketplace distribution.

## Development

```sh
npm run typecheck    # tsc --noEmit
paseo plugin reload paseo-linear-todo
paseo plugin logs paseo-linear-todo
```

Source layout: `index.ts` (contributions + RPC handlers, runs unsandboxed in
the daemon), `linear.ts` (GraphQL client), `config.ts`, `prompt.shared.ts`,
`panel.client.tsx` (list) and `handoff.client.tsx` (sheet). The `*.client.tsx`
files are excluded from the daemon bundle — clients only ever see RPC results.
