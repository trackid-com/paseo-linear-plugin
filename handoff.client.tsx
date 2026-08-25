import type {
  PaseoProviderSnapshotResult,
  PaseoWorkspace,
} from "@getpaseo/client";
import type { PluginSurfaceProps, PluginTheme } from "@getpaseo/plugin";
import { usePaseo } from "@getpaseo/plugin";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { LinearIssue } from "./contracts.shared";
import { hydratePrompt } from "./prompt.shared";

type SheetProps = {
  theme: PluginTheme;
  layout: { compact: boolean };
  issue: LinearIssue;
  /** Fixed hand-off target directory (workspace panel). Absent → user picks a workspace. */
  workspaceDir?: string;
  moveToStarted: boolean;
  promptTemplate: string;
  onClose: () => void;
  onConfirmed: (input: {
    comment: string;
    moveToStarted: boolean;
  }) => Promise<void>;
};

interface ModelChoice {
  value: string;
  label: string;
}

interface WorkspaceChoice {
  id: string;
  directory: string;
  label: string;
}

export function HandoffSheet({
  theme,
  layout,
  issue,
  workspaceDir,
  moveToStarted,
  promptTemplate,
  onClose,
  onConfirmed,
}: SheetProps) {
  const paseo = usePaseo();

  const [prompt, setPrompt] = useState(() =>
    hydratePrompt(promptTemplate, issue),
  );
  const [worktree, setWorktree] = useState(true);
  const [moveTo, setMoveTo] = useState(moveToStarted);
  const [models, setModels] = useState<ModelChoice[] | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceChoice[] | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<WorkspaceChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = (await paseo.providers.snapshot({
          cwd: workspaceDir,
        })) as PaseoProviderSnapshotResult;
        const choices: ModelChoice[] = [];
        let fallback: string | null = null;
        for (const entry of snapshot.entries) {
          if (entry.status !== "ready" || entry.enabled === false) continue;
          const providerLabel = entry.label ?? entry.provider;
          for (const model of entry.models ?? []) {
            if (model.isSelectable === false) continue;
            choices.push({
              value: `${entry.provider}/${model.id}`,
              label: `${providerLabel} · ${model.label}`,
            });
            if (model.isDefault && !fallback) {
              fallback = `${entry.provider}/${model.id}`;
            }
          }
        }
        if (!cancelled) {
          setModels(choices);
          setSelectedModel(fallback ?? choices[0]?.value ?? null);
        }
      } catch {
        if (!cancelled) setModels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paseo, workspaceDir]);

  useEffect(() => {
    if (workspaceDir) {
      setSelectedWorkspace({
        id: "fixed",
        directory: workspaceDir,
        label: workspaceDir,
      });
      setWorkspaces(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await paseo.workspaces.list();
        const choices = (res.entries ?? [])
          .map((w: PaseoWorkspace) => ({
            id: w.id,
            directory: w.workspaceDirectory ?? w.projectRootPath,
            label: w.title ?? w.name ?? w.id,
          }))
          .filter((w: { directory: string }) => Boolean(w.directory));
        if (!cancelled) {
          setWorkspaces(choices);
          setSelectedWorkspace((prev) => prev ?? choices[0] ?? null);
        }
      } catch {
        if (!cancelled) setWorkspaces([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paseo, workspaceDir]);

  const branch = `linear/${issue.identifier}`;

  const targetDir = workspaceDir ?? selectedWorkspace?.directory;
  const targetLabel = workspaceDir ?? selectedWorkspace?.label;

  const confirm = async () => {
    if (!selectedModel) {
      setFailure(
        "No provider model selected — configure a provider in Paseo first.",
      );
      return;
    }
    if (!targetDir) {
      setFailure("Pick a workspace for the agent to work in.");
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const agent = await paseo.agents.create({
        cwd: targetDir,
        title: `${issue.identifier} ${issue.title}`,
        prompt,
        config: { provider: selectedModel },
        worktree: worktree
          ? { mode: "branch-off", newBranch: branch }
          : undefined,
        labels: { linear: issue.identifier },
      });
      const comment = worktree
        ? `Picked up in Paseo — agent \`${agent.id}\`, branch \`${branch}\`.`
        : `Picked up in Paseo — agent \`${agent.id}\`.`;
      await onConfirmed({ comment, moveToStarted: moveTo });
    } catch (e) {
      setFailure(`Hand-off failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const styles = useMemo(
    () => ({
      backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center" as const,
      },
      card: {
        backgroundColor: theme.colors.surface0,
        margin: layout.compact ? 8 : 16,
        borderRadius: 12,
        padding: layout.compact ? 14 : 20,
        maxHeight: "85%" as const,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: 16,
        fontWeight: "700" as const,
      },
      sub: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        marginTop: 2,
        marginBottom: 10,
      },
      label: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        marginTop: 10,
        marginBottom: 4,
      },
      input: {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface0,
        borderWidth: 1,
        borderColor: theme.colors.foregroundMuted,
        borderRadius: 8,
        padding: 8,
        fontSize: 13,
        minHeight: 110,
        textAlignVertical: "top" as const,
      },
      chipRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 6,
      },
      chip: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.foregroundMuted,
      },
      chipSelected: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
      },
      chipText: { color: theme.colors.foreground, fontSize: 12 },
      chipTextSelected: { color: theme.colors.accentForeground, fontSize: 12 },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        paddingVertical: 6,
      },
      rowLabel: { color: theme.colors.foreground, fontSize: 13 },
      buttons: {
        flexDirection: "row" as const,
        gap: 10,
        marginTop: 14,
      },
      button: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: "center" as const,
      },
      cancel: {
        backgroundColor: theme.colors.surface0,
        borderWidth: 1,
        borderColor: theme.colors.foregroundMuted,
      },
      primary: { backgroundColor: theme.colors.accent },
      buttonText: { fontSize: 13, fontWeight: "700" as const },
      cancelText: { color: theme.colors.foreground },
      primaryText: { color: theme.colors.accentForeground },
      failure: { color: theme.colors.statusDanger, fontSize: 12, marginTop: 8 },
      modelsEmpty: { color: theme.colors.foregroundMuted, fontSize: 12 },
    }),
    [theme, layout.compact],
  );

  return (
    <View style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={busy ? undefined : onClose}
      />
      <View style={styles.card}>
        <Text style={styles.title}>
          {issue.identifier}: {issue.title}
        </Text>
        <Text style={styles.sub}>{issue.team.key}</Text>

        <ScrollView>
          <Text style={styles.label}>Prompt for the agent</Text>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            multiline
            editable={!busy}
            style={styles.input}
            placeholder="Prompt…"
            placeholderTextColor={theme.colors.foregroundMuted}
          />

          <Text style={styles.label}>Model</Text>
          {models === null ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : models.length === 0 ? (
            <Text style={styles.modelsEmpty}>
              No enabled provider with models — pick one in Paseo settings.
            </Text>
          ) : (
            <View style={styles.chipRow}>
              {models.map((model) => {
                const selected = model.value === selectedModel;
                return (
                  <Pressable
                    key={model.value}
                    onPress={() => setSelectedModel(model.value)}
                  >
                    <View
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text
                        style={
                          selected ? styles.chipTextSelected : styles.chipText
                        }
                      >
                        {model.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {!workspaceDir ? (
            <>
              <Text style={styles.label}>Workspace</Text>
              {workspaces === null ? (
                <ActivityIndicator color={theme.colors.accent} />
              ) : workspaces.length === 0 ? (
                <Text style={styles.modelsEmpty}>
                  No Paseo workspace available.
                </Text>
              ) : (
                <View style={styles.chipRow}>
                  {workspaces.map((ws) => {
                    const selected = ws.id === selectedWorkspace?.id;
                    return (
                      <Pressable
                        key={ws.id}
                        onPress={() => setSelectedWorkspace(ws)}
                      >
                        <View
                          style={[styles.chip, selected && styles.chipSelected]}
                        >
                          <Text
                            style={
                              selected
                                ? styles.chipTextSelected
                                : styles.chipText
                            }
                          >
                            {ws.label}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          ) : null}

          <View style={styles.row}>
            <Text style={styles.rowLabel}>New git worktree</Text>
            <Switch
              value={worktree}
              onValueChange={setWorktree}
              disabled={busy}
              trackColor={{ true: theme.colors.accent }}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Move to In Progress</Text>
            <Switch
              value={moveTo}
              onValueChange={setMoveTo}
              disabled={busy}
              trackColor={{ true: theme.colors.accent }}
            />
          </View>

          {targetLabel && !workspaceDir ? (
            <Text style={styles.sub}>Agent will work in: {targetLabel}</Text>
          ) : null}

          {failure ? <Text style={styles.failure}>{failure}</Text> : null}
        </ScrollView>

        <View style={styles.buttons}>
          <Pressable onPress={onClose} disabled={busy} style={{ flex: 1 }}>
            <View style={[styles.button, styles.cancel]}>
              <Text style={[styles.buttonText, styles.cancelText]}>Cancel</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => void confirm()}
            disabled={busy}
            style={{ flex: 1 }}
          >
            <View style={[styles.button, styles.primary]}>
              {busy ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.accentForeground}
                />
              ) : (
                <Text style={[styles.buttonText, styles.primaryText]}>
                  Start agent
                </Text>
              )}
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export type TodoSurfaceProps = Pick<PluginSurfaceProps, "theme" | "layout">;
