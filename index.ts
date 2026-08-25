import type { PluginContext } from "@getpaseo/plugin";
import { TodoPanel } from "./panel.client";
import { listTodo, handoff } from "./contracts.shared";
import { loadConfig } from "./config";
import { addComment, listTodo as fetchTodo, startIssue } from "./linear";

export default function contribute(plugin: PluginContext) {
  plugin.handle(listTodo, (input) => {
    const { config, error } = loadConfig();
    if (error) throw new Error(error);
    return fetchTodo(config, input.refresh ?? false);
  });

  plugin.handle(handoff, async (input) => {
    const { config, error } = loadConfig();
    if (error) throw new Error(error);
    try {
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

  return () => {};
}
