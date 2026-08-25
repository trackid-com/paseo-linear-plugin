import type { PluginSurfaceProps } from "@getpaseo/plugin";
import { TodoList } from "./todo-list.client";

export function TodoSurface({ theme, layout }: PluginSurfaceProps) {
  return <TodoList theme={theme} layout={layout} />;
}
