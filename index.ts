import type { PluginContext } from "@getpaseo/plugin";
import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";
import { ProbePanel } from "./probe.client";

export const probeHello = defineRpc({
  name: "linear-todo.probe.hello",
  input: z.object({ from: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

function handleProbeHello({ from }: z.output<typeof probeHello.input>) {
  console.log(`[probe] hello from ${from}`);
  return { ok: true };
}

export default function contribute(plugin: PluginContext) {
  plugin.handle(probeHello, handleProbeHello);
  plugin.addWorkspacePanel({
    id: "probe",
    title: "Spike probe",
    icon: "FlaskConical",
    context: "workspace",
    Component: ProbePanel,
  });
  plugin.addCommandCenterItem({
    id: "open-probe",
    title: "Open spike probe",
    icon: "FlaskConical",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("probe");
    },
  });
  plugin.addCommandCenterItem({
    id: "spawn-probe-agent",
    title: "Spawn probe worktree agent",
    icon: "Bug",
    context: "workspace",
    async onSelect({ paseo, workspace }) {
      try {
        const agent = await paseo.agents.create({
          cwd: workspace.directory,
          title: "spike-probe",
          prompt: "Reply with exactly the word: probing",
          config: { provider: "claude/sonnet-5" },
          worktree: { mode: "branch-off", newBranch: "spike/linear-todo-probe" },
          labels: { probe: "1" },
        });
        console.log(`[probe] agent spawned ${agent.id}`);
      } catch (e) {
        console.error(`[probe] spawn failed: ${(e as Error).message}`);
      }
    },
  });
  return () => {};
}
