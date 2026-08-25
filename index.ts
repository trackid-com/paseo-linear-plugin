import type { PluginContext } from "@getpaseo/plugin";
import { loadConfig } from "./config";
import { handoff, listTodo } from "./contracts.shared";
import { addComment, listTodo as fetchTodo, startIssue } from "./linear";
import { TodoPanel } from "./panel.client";
import { TodoSurface } from "./surface.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(listTodo, (input) => {
    const { config, error } = loadConfig();
    if (error) throw new Error(error);
    console.log(`[linear-todo] list(refresh=${input.refresh ?? false})`);
    return fetchTodo(config, input.refresh ?? false);
  });

  plugin.handle(handoff, async (input) => {
    const { config, error } = loadConfig();
    if (error) throw new Error(error);
    let moved = false;
    let commentAdded = false;
    const warnings: string[] = [];
    try {
      console.log(
        `[linear-todo] handoff(issue=${input.issueId}, moveToStarted=${input.moveToStarted}, commentLen=${input.comment.length})`,
      );
      if (input.moveToStarted) {
        moved = await startIssue(config, input.teamId, input.issueId);
        if (!moved) {
          warnings.push(
            "Could not move issue — no started workflow state for this team.",
          );
        }
      }
      if (input.comment.trim()) {
        commentAdded = await addComment(
          config,
          input.issueId,
          input.comment.trim(),
        );
        if (!commentAdded) {
          warnings.push("Could not add comment to issue.");
        }
      }
      return {
        moved,
        commentAdded,
        error: warnings.length > 0 ? warnings.join(" ") : null,
      };
    } catch (e) {
      return { moved, commentAdded, error: (e as Error).message };
    }
  });

  plugin.addSurface("linear-todo", TodoSurface);

  plugin.addSidebarItem({
    id: "linear-todo",
    title: "Linear todo",
    icon: "ListTodo",
    surface: "linear-todo",
  });

  plugin.addWorkspacePanel({
    id: "linear-todo",
    title: "Linear todo",
    icon: "ListTodo",
    context: "workspace",
    Component: TodoPanel,
  });

  plugin.addCommandCenterItem({
    id: "open-linear-todo",
    title: "Open Linear todo",
    icon: "ListTodo",
    keywords: ["linear", "todo", "issues"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("linear-todo");
    },
  });

  return () => {};
}
