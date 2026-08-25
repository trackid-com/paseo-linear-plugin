# Paseo plugin: Linear Todo → agent hand-off

## Context

Picking up work today means leaving Paseo: open Linear, read the Todo column,
copy an issue into a new agent's composer by hand, then remember to flip the
status. With two people and a lot of concurrent agents, that also means
occasionally grabbing an issue someone already started.

This plugin puts the team's Todo column inside Paseo as a workspace panel, and
turns "I'll take this one" into a single click that spawns an agent in a fresh
git worktree, primed with the issue, with Linear updated to match.

Deliberately **repo-agnostic**: it must work for any Linear workspace and any
project, not just the ID monorepo. Nothing in it may reference `trackid`, the
`ID` team, or ID's `.envrc`/`linearis` setup.

**Status: experimental by nature.** Paseo's own docs call plugins experimental,
"not designed for distribution yet", with expected breaking API changes. Build
accordingly — small surface, no clever abstractions.

## Success criteria

1. Panel lists the team's unstarted issues in any Linear workspace, given only a
   config file with an API token.
2. Clicking an issue opens a sheet; confirming it produces a running agent in a
   new worktree whose first message is the hydrated issue.
3. The issue moves to the team's started state and gets a comment, and drops off
   the panel on next refresh.
4. Fresh install by someone else (Lorenz) works from the README alone.

## Non-goals

- Creating, editing, or closing Linear issues.
- Sub-issues, relations, attachments, project/milestone views.
- Any status transition after hand-off (In Review, Done) — the agent's PR flow
  owns that.
- Distribution beyond `git clone && paseo plugin install`. No marketplace.
- Multi-workspace/multi-token support. One token, one config.

## Decisions (settled)

| Area | Decision |
| --- | --- |
| Surface | Workspace panel only (`addWorkspacePanel`) |
| Hand-off | Click → confirm sheet → `agents.create` |
| Worktree | New git worktree, checkbox in sheet, default on |
| Prompt | Hardcoded default template, `promptTemplate` config override, editable in sheet |
| Token | `~/.paseo/plugins/linear-todo/config.json`, `LINEAR_API_TOKEN` env wins if set |
| Linear API | Raw GraphQL over `fetch`, no dependencies |
| "Todo" | State **type** `unstarted`; optional state-name override in config |
| Scope | Configured team(s), no assignee filter, priority desc then updatedAt, cap 50 |
| Write-back | Move to first started state + comment; checkbox in sheet, default on |
| Refresh | On mount, manual ↻, 60s poll only while panel is visible |
| Home | Standalone git repo |
| Extras in v1 | Model/provider picker in sheet; open-in-Linear link per row |

## Architecture

```
paseo-linear-todo/
├─ index.ts            # contributions + RPC handlers (daemon, unsandboxed Node)
├─ linear.ts           # GraphQL client: listTodo, startIssue, comment, states
├─ config.ts           # load + validate ~/.paseo/plugins/linear-todo/config.json
├─ prompt.ts           # default template + {{placeholder}} hydration
├─ panel.client.tsx    # list, refresh, empty/error states
├─ handoff.client.tsx  # confirm sheet
├─ package.json
└─ README.md           # install + config.json shape
```

Split matters: `*.client.tsx` is excluded from the daemon bundle. The token never
crosses into a client file — clients only ever see RPC results.

### Config

```jsonc
{
  "apiToken": "lin_api_…",          // or LINEAR_API_TOKEN in daemon env
  "teamKeys": ["ID"],               // omit → every team the token can see
  "statusNames": ["Todo"],          // optional; omit → state type "unstarted"
  "assignee": "any",                // "any" | "me" | "unassigned"
  "limit": 50,
  "moveToStarted": true,
  "promptTemplate": "…"             // optional, overrides the built-in
}
```

`chmod 600`. Missing/invalid config is not a crash: the panel renders an empty
state printing the exact path and this shape.

### RPC contracts (`defineRpc` + zod, handled in `index.ts`)

- `linear.todo.list` → `{ issues[], teams[], fetchedAt }`. Backend caches the
  result ~15s so desktop + phone + a re-mount don't triple the API calls.
- `linear.todo.handoff` → `{ issueId, moveToStarted, comment }` → performs the
  Linear writes only. **The agent spawn does not go through this.**
- `linear.models.list` → thin pass-through for the sheet's model dropdown if
  `paseo.providers` isn't reachable client-side (see Spike).

### GraphQL

One query. Filter is `team: { key: { in: [...] } }` (omitted when `teamKeys` is
unset) plus either `state: { type: { eq: "unstarted" } }` or
`state: { name: { in: statusNames } }`. Fields: `identifier`, `title`,
`description`, `url`, `priority`, `updatedAt`, `assignee { name }`,
`labels { nodes { name } }`, `state { id name type }`, `team { id key }`.

Write-back is two mutations: `issueUpdate(stateId:)` targeting the team's first
workflow state of type `started` (query `team.states` once, cache per team), and
`commentCreate`.

### Hand-off flow

1. Row tap → sheet opens with the hydrated prompt, model picker (default =
   Paseo's default), `New git worktree` ✓, `Move to In Progress` ✓ (from config).
2. Confirm →
   ```ts
   await paseo.agents.create({
     cwd: workspace.directory,      // from useWorkspace(workspaceId, …)
     worktree: true,
     title: `${identifier} ${title}`,
     prompt: hydratedPrompt,
     labels: [identifier],
     config: selectedModel,
   });
   ```
3. Then `rpc(handoffContract, { issueId, moveToStarted, comment })`. **In this
   order** — if the Linear write fails, you still have a working agent, and a
   stale Todo row is a far cheaper failure than a lost hand-off. Surface the
   write failure as a non-blocking toast in the panel.

### Default prompt template

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

### UI rules (from the docs — these bite)

- Colors only from `theme.colors` (`foreground`, `foregroundMuted`, `surface0`).
  Hardcoded black text fails in dark themes.
- Honour `layout.compact`; the panel must survive a phone-width render.
- Icons are Lucide names, passed as strings.

## Build order

1. **Spike (do this first, ~30 min).** Two assumptions are documented but
   unverified. Scaffold with `paseo plugin init`, register a throwaway panel with
   a hardcoded button, and confirm: (a) `usePaseo()` is reachable from a
   workspace-panel component, and (b) `agents.create` accepts `worktree` and
   `prompt` and actually starts a worktree agent. If either fails, stop and
   re-plan the hand-off mechanism before writing anything else.
2. `config.ts` + `linear.ts` + `linear.todo.list` RPC. Verify with
   `paseo plugin logs linear-todo`.
3. `panel.client.tsx`: list, priority/assignee/labels, ↻, visibility-gated 60s
   poll, empty state, config-missing state, error state, open-in-Linear.
4. `prompt.ts` + `handoff.client.tsx`: sheet, editable prompt, model picker,
   two checkboxes.
5. Wire the spawn + `linear.todo.handoff` write-back, in that order.
6. README: token creation, config path and shape, `paseo plugin install`.

Commit at each step. Conventional Commits.

## Verification

- **Read path:** with a valid config, panel matches Linear's Todo column for the
  configured team — same issues, same order. Rename the column in Linear; the
  panel still works (proves the `unstarted` type filter, not the name).
- **No config:** move `config.json` aside, reload the plugin. Panel shows the
  setup instructions, no crash, no error spam in `paseo plugin logs`.
- **Bad token:** panel shows an auth error, not a blank list.
- **Hand-off:** pick a real low-stakes issue. Confirm a new worktree agent exists
  with the issue as its first message, the issue is In Progress in Linear with a
  comment, and it's gone from the panel after ↻.
- **Write-back failure:** temporarily point the token at a read-only scope (or
  break the mutation) and confirm the agent still spawns and a toast reports the
  failure.
- **Themes/layout:** render in a light theme, a dark theme, and at phone width.
- **Reload:** `paseo plugin reload linear-todo` twice in a row — the 60s poll must
  not leak a second timer.

## Open, non-blocking

- Command Center item and composer attachment source are deliberately deferred;
  both reuse the same RPCs and can be added once the panel has earned its keep.
- Once the repo exists, copy this plan into its `docs/` so it lives next to the
  code rather than only in `~/.claude/plans`.
