import type { LinearIssue } from "./contracts.shared";

export const DEFAULT_PROMPT_TEMPLATE = `Work on {{identifier}}: {{title}}
{{url}}

## Description
{{description}}

## Comments
{{comments}}

Follow this repo's conventions (CLAUDE.md / AGENTS.md if present).
Plan before you code.`;

export function formatComments(issue: LinearIssue): string {
  if (issue.comments.length === 0) {
    return "(no comments)";
  }
  return issue.comments
    .map((c) => {
      const when = c.createdAt
        ? ` (${new Date(c.createdAt).toISOString().slice(0, 10)})`
        : "";
      return `- ${c.user ?? "unknown"}${when}: ${c.body}`;
    })
    .join("\n");
}

export function hydratePrompt(template: string, issue: LinearIssue): string {
  const values: Record<string, string> = {
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    description: issue.description?.trim()
      ? issue.description
      : "(no description)",
    comments: formatComments(issue),
  };
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key: string) => values[key] ?? match,
  );
}
