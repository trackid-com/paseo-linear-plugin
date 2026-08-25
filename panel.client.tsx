import type { PluginWorkspacePanelProps } from "@getpaseo/plugin";
import { useWorkspace } from "@getpaseo/plugin";
import { TodoList } from "./todo-list.client";

export function TodoPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const workspace = useWorkspace(workspaceId, (w) => ({ directory: w.directory }));
  return <TodoList theme={theme} layout={layout} workspaceDir={workspace?.directory} />;
}
