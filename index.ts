import type { PluginContext } from "@getpaseo/plugin";
import { TodoPanel } from "./panel.client";
import { listTodo, handoff } from "./contracts.shared";
import { loadConfig } from "./config";
import { addComment, listTodo as fetchTodo, startIssue } from "./linear";

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
    try {
      console.log(`[linear-todo] handoff(issue=${input.issueId}, moveToStarted=${input.moveToStarted}, commentLen=${input.comment.length})`);
      const moved = input.moveToStarted
        ? await startIssue(config, input.teamId, input.issueId)
        : false;
      const commentAdded = input.comment.trim()
        ? await addComment(config, input.issueId, input.comment.trim())
        : false;
      return { moved, commentAdded, error: null };
    } catch (e) {
      return { moved: false, commentAdded: false, error: (e as Error).message };
    }
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
