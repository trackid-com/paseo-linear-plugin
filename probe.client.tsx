import type { PluginWorkspacePanelProps } from "@getpaseo/plugin";
import { usePaseo, useRpc, useWorkspace } from "@getpaseo/plugin";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { probeHello } from "./index";

export function ProbePanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const paseo = usePaseo();
  const rpc = useRpc(probeHello);
  const workspace = useWorkspace(workspaceId, ({ directory, name }) => ({ directory, name }));
  const [providers, setProviders] = useState<string[] | null>(null);
  const [rpcResult, setRpcResult] = useState<string | null>(null);
  const [spawnResult, setSpawnResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void rpc({ from: "panel-mounted" }).then(() => setRpcResult("rpc ok (auto)"));
  }, [rpc]);

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 16 : 24,
        gap: layout.compact ? 10 : 16,
        backgroundColor: theme.colors.surface0,
      },
      title: { color: theme.colors.foreground, fontSize: 18, fontWeight: "600" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 13 },
      button: {
        backgroundColor: theme.colors.accent,
        padding: 10,
        borderRadius: 8,
        alignItems: "center" as const,
      },
      buttonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      danger: { color: theme.colors.statusDanger, fontSize: 13 },
    }),
    [theme, layout.compact],
  );

  async function probeUsePaseo() {
    setBusy(true);
    try {
      const snapshot = await paseo.providers.snapshot({ cwd: workspace?.directory });
      const names = (snapshot as { providers?: { id: string }[] }).providers?.map((p) => p.id) ?? [];
      setProviders(names);
      await rpc({ from: "probe-panel" });
      setRpcResult("rpc ok");
    } catch (e) {
      setRpcResult(`rpc failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function spawnProbeAgent() {
    setBusy(true);
    setSpawnResult(null);
    try {
      const agent = await paseo.agents.create({
        cwd: workspace?.directory ?? "/Users/ericschaefer/Projects/paseo-linear-todo",
        title: "spike-probe",
        prompt: "Reply with exactly the word: probing",
        config: { provider: "claude/sonnet-5" },
        worktree: { mode: "branch-off", newBranch: "spike/linear-todo-probe" },
        labels: { probe: "1" },
      });
      setSpawnResult(`agent created: ${agent.id}`);
      await agent.send("That's all, stop working. Just acknowledge and stop.");
    } catch (e) {
      setSpawnResult(`spawn failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Probe</Text>
      <Text style={styles.detail}>workspace: {workspace?.name} @ {workspace?.directory}</Text>
      <Text style={styles.detail}>usePaseo reachable: {paseo ? "yes" : "no"}</Text>
      <Text style={styles.detail}>providers: {providers ? providers.join(", ") : "not fetched"}</Text>
      <Text style={styles.detail}>rpc: {rpcResult ?? "not called"}</Text>
      <Text style={styles.detail}>spawn: {spawnResult ?? "not called"}</Text>
      {busy ? <ActivityIndicator color={theme.colors.accent} /> : null}
      <Pressable accessibilityRole="button" onPress={() => void probeUsePaseo()} disabled={busy}>
        <View style={styles.button}>
          <Text style={styles.buttonText}>1. usePaseo + rpc</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void spawnProbeAgent()} disabled={busy}>
        <View style={styles.button}>
          <Text style={styles.buttonText}>2. spawn worktree agent</Text>
        </View>
      </Pressable>
      <Text style={styles.danger}>
        {workspace?.directory ? "" : "No workspace directory — spawn would fail."}
      </Text>
    </View>
  );
}
