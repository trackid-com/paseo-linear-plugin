import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const linearIssue = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  url: z.string(),
  priority: z.number(),
  updatedAt: z.string(),
  assignee: z
    .object({ id: z.string(), name: z.string() })
    .nullish(),
  labels: z.array(z.string()),
  state: z.object({ id: z.string(), name: z.string(), type: z.string() }),
  team: z.object({ id: z.string(), key: z.string() }),
  comments: z.array(
    z.object({
      body: z.string(),
      user: z.string().nullish(),
      createdAt: z.string(),
    }),
  ),
});

export const linearTeam = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});

export const listTodo = defineRpc({
  name: "linear.todo.list",
  input: z.object({
    refresh: z.boolean().optional(),
  }),
  output: z.object({
    issues: z.array(linearIssue),
    teams: z.array(linearTeam),
    fetchedAt: z.string(),
    moveToStarted: z.boolean(),
    promptTemplate: z.string(),
  }),
});

export const handoff = defineRpc({
  name: "linear.todo.handoff",
  input: z.object({
    issueId: z.string(),
    teamId: z.string(),
    moveToStarted: z.boolean(),
    comment: z.string(),
  }),
  output: z.object({
    moved: z.boolean(),
    commentAdded: z.boolean(),
    error: z.string().nullish(),
  }),
});

export type LinearIssue = z.output<typeof linearIssue>;
export type LinearTeam = z.output<typeof linearTeam>;
