import { useRpc } from "@getpaseo/plugin";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";
import { handoff, listTodo, type LinearIssue } from "./contracts.shared";
import { HandoffSheet } from "./handoff.client";

const CONFIG_PATH_HINT = "~/.paseo/plugins/linear-todo/config.json";

const PRIORITY_LABEL: Record<number, string> = { 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" };

const CONFIG_ERROR_MARKERS = ["No Linear config", "config.json", "apiToken"];

interface ListState {
  issues: LinearIssue[];
  fetchedAt: string;
  moveToStarted: boolean;
  promptTemplate: string;
}

export interface TodoListProps {
  theme: import("@getpaseo/plugin").PluginTheme;
  layout: { compact: boolean };
  /** Fixed hand-off target (workspace panel). Omitted → the sheet shows a picker. */
  workspaceDir?: string;
}

export function TodoList({ theme, layout, workspaceDir }: TodoListProps) {
  const list = useRpc(listTodo);
  const doHandoff = useRpc(handoff);

  const [state, setState] = useState<ListState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LinearIssue | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(() => AppState.currentState === "active");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const result = await list({ refresh: force });
        setState({
          issues: result.issues,
          fetchedAt: result.fetchedAt,
          moveToStarted: result.moveToStarted,
          promptTemplate: result.promptTemplate,
        });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [list],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setAppActive(next === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!appActive || selected) {
      return;
    }
    void refresh(true);
    timerRef.current = setInterval(() => void refresh(false), 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, appActive, selected]);

  const flash = useCallback((message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 6000);
  }, []);

  const handleConfirmed = useCallback(
    async (issue: LinearIssue, input: { comment: string; moveToStarted: boolean }) => {
      try {
        const result = await doHandoff({
          issueId: issue.id,
          teamId: issue.team.id,
          moveToStarted: input.moveToStarted,
          comment: input.comment,
        });
        if (result.error) {
          flash(`Agent spawned, but Linear write-back failed: ${result.error}`);
        } else {
          flash(
            result.moved || result.commentAdded
              ? "Handed off — issue updated in Linear."
              : "Handed off.",
          );
        }
      } catch (e) {
        flash(`Agent spawned, but Linear write-back failed: ${(e as Error).message}`);
      }
      setSelected(null);
      void refresh(true);
    },
    [doHandoff, flash, refresh],
  );

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
        padding: layout.compact ? 8 : 12,
      },
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        paddingVertical: layout.compact ? 6 : 10,
        paddingHorizontal: layout.compact ? 4 : 8,
      },
      headerTitle: { color: theme.colors.foreground, fontSize: 15, fontWeight: "700" as const },
      headerMeta: { color: theme.colors.foregroundMuted, fontSize: 12 },
      refreshButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      refreshText: { color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" as const },
      row: {
        paddingVertical: layout.compact ? 8 : 10,
        paddingHorizontal: layout.compact ? 8 : 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.surface0,
        backgroundColor: theme.colors.surface0,
      },
      rowTop: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
      },
      identifier: { color: theme.colors.accent, fontSize: 12, fontWeight: "700" as const },
      rowTitle: {
        color: theme.colors.foreground,
        fontSize: 14,
        fontWeight: "600" as const,
        flex: 1,
      },
      link: { paddingHorizontal: 6, paddingVertical: 2 },
      linkText: { color: theme.colors.foregroundMuted, fontSize: 12 },
      rowMeta: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 6,
        marginTop: 4,
      },
      metaChip: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
      },
      labelChip: {
        color: theme.colors.accent,
        fontSize: 12,
      },
      empty: { padding: 24, alignItems: "center" as const },
      emptyText: { color: theme.colors.foregroundMuted, fontSize: 13, textAlign: "center" as const },
      errorText: { color: theme.colors.statusDanger, fontSize: 13 },
      hint: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 4 },
      status: { color: theme.colors.accent, fontSize: 12, textAlign: "center" as const, paddingBottom: 6 },
    }),
    [theme, layout.compact],
  );

  const isConfigError = CONFIG_ERROR_MARKERS.some((marker) => error?.includes(marker));

  if (error) {
    return (
      <View style={styles.screen}>
        <Text style={styles.errorText}>{error}</Text>
        {isConfigError ? <Text style={styles.hint}>Config lives at {CONFIG_PATH_HINT}.</Text> : null}
        <Pressable onPress={() => void refresh(true)}>
          <View style={[styles.refreshButton, { marginTop: 12 }]}>
            <Text style={styles.refreshText}>Retry</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  const issues = state?.issues ?? [];

  return (
    <View style={styles.screen}>
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Linear todo</Text>
          <Text style={styles.headerMeta}>
            {loading
              ? "loading…"
              : `${issues.length} ${issues.length === 1 ? "issue" : "issues"}${
                  state ? ` · updated ${new Date(state.fetchedAt).toLocaleTimeString()}` : ""
                }`}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void refresh(true)} disabled={loading}>
          <View style={styles.refreshButton}>
            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.accentForeground} />
            ) : null}
            <Text style={styles.refreshText}>↻</Text>
          </View>
        </Pressable>
      </View>

      <FlatList
        data={issues}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowTop}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSelected(item)}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={styles.identifier}>{item.identifier}</Text>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(item.url).catch(() => {})}
                hitSlop={8}
              >
                <View style={styles.link}>
                  <Text style={styles.linkText}>↗</Text>
                </View>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelected(item)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <View style={styles.rowMeta}>
                {item.priority > 0 ? (
                  <Text style={styles.metaChip}>{PRIORITY_LABEL[item.priority] ?? "Priority"}</Text>
                ) : null}
                <Text style={styles.metaChip}>{item.assignee?.name ?? "Unassigned"}</Text>
                {item.labels.slice(0, 3).map((label, index) => (
                  <Text key={`${item.id}-${label}-${index}`} style={styles.labelChip}>
                    #{label}
                  </Text>
                ))}
              </View>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Nothing in the todo column. Pick up a Linear issue and it shows up here.
              </Text>
            </View>
          )
        }
      />

      {selected ? (
        <HandoffSheet
          theme={theme}
          layout={layout}
          issue={selected}
          workspaceDir={workspaceDir}
          moveToStarted={state?.moveToStarted ?? true}
          promptTemplate={state?.promptTemplate ?? ""}
          onClose={() => setSelected(null)}
          onConfirmed={(input) => handleConfirmed(selected, input)}
        />
      ) : null}
    </View>
  );
}
