// ==============================================
// AyuLink Patient - Ayu
//
// The health-profile assistant. It speaks first (there is no opening
// message from the patient), asks a fixed set of questions in English or
// Sinhala, and shows everything back for confirmation before a single
// value is written.
//
// Three interrupt types, three pieces of UI: a language picker, a
// question with a text box, and the final report with Confirm / change.
// ==============================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/lib/auth";
import {
    ayuHistory,
    ayuResume,
    ayuStart,
    ayuThreadId,
    type AyuInterrupt,
} from "../src/lib/ayu";
import type { AgentEvent } from "../src/lib/agentChat";
import { Banner, Button, Input } from "../src/components/ui";
import { FormattedText } from "../src/components/FormattedText";
import { colors, radius, shadow, spacing } from "../src/theme";

type Item =
    | { id: string; kind: "assistant"; text: string }
    | { id: string; kind: "user"; text: string }
    | { id: string; kind: "interrupt"; payload: AyuInterrupt; resolved: boolean }
    | { id: string; kind: "system"; text: string; tone: "error" | "info" };

let seq = 0;
const nextId = () => `ayu-${Date.now()}-${seq++}`;

export default function Ayu() {
    const { user } = useAuth();
    const params = useLocalSearchParams<{ mode?: string; lang?: string }>();
    const mode: "INTAKE" | "CHECKIN" = params.mode === "CHECKIN" ? "CHECKIN" : "INTAKE";
    // The language is part of the thread id: switching it must open a fresh
    // conversation rather than resuming one whose language is already fixed
    // in its checkpoint. Absent (a deep link, a cold start) just falls back
    // to the language-less id.
    const threadId = ayuThreadId(user?.id ?? "anon", mode, params.lang);

    const [items, setItems] = useState<Item[]>([]);
    const [pending, setPending] = useState<AyuInterrupt | null>(null);
    const [busy, setBusy] = useState(true);
    const [thinking, setThinking] = useState<string | null>(null);
    const [answer, setAnswer] = useState("");
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState("");
    const listRef = useRef<FlatList<Item>>(null);
    const streamId = useRef<string | null>(null);
    const insets = useSafeAreaInsets();

    const scrollEnd = () =>
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    const onEvent = useCallback((e: AgentEvent) => {
        switch (e.event) {
            case "thinking":
                setThinking(e.data.message);
                break;
            case "token": {
                setThinking(null);
                if (!streamId.current) {
                    const id = nextId();
                    streamId.current = id;
                    setItems((p) => [...p, { id, kind: "assistant", text: e.data.content }]);
                } else {
                    const id = streamId.current;
                    setItems((p) =>
                        p.map((it) =>
                            it.id === id && it.kind === "assistant"
                                ? { ...it, text: it.text + e.data.content }
                                : it
                        )
                    );
                }
                scrollEnd();
                break;
            }
            case "interrupt": {
                streamId.current = null;
                setThinking(null);
                const payload = e.data as unknown as AyuInterrupt;
                setPending(payload);
                setItems((p) => [
                    ...p,
                    ...p.filter(() => false),
                    { id: nextId(), kind: "interrupt", payload, resolved: false },
                ]);
                scrollEnd();
                break;
            }
            case "error":
                streamId.current = null;
                setThinking(null);
                setItems((p) => [...p, { id: nextId(), kind: "system", tone: "error", text: e.data.message }]);
                break;
            case "done":
                streamId.current = null;
                setThinking(null);
                break;
            default:
                break;
        }
    }, []);

    const run = useCallback(
        async (fn: (cb: (e: AgentEvent) => void) => Promise<void>) => {
            setBusy(true);
            streamId.current = null;
            try {
                await fn(onEvent);
            } catch (err) {
                setItems((p) => [
                    ...p,
                    {
                        id: nextId(),
                        kind: "system",
                        tone: "error",
                        text: err instanceof Error ? err.message : "Something went wrong",
                    },
                ]);
            } finally {
                setBusy(false);
            }
        },
        [onEvent]
    );

    // Resume an interview already in progress rather than restarting it —
    // someone who answered six questions and closed the app must not be
    // asked all ten again.
    useEffect(() => {
        (async () => {
            try {
                const h = await ayuHistory(threadId);
                // Started, nothing pending, nothing saved: an earlier run
                // stopped before it asked anything — a restarted server, a
                // dropped connection. Replaying that transcript leaves a
                // greeting and a Done button with no way forward, and the
                // CHECKIN thread id is month-scoped, so it would stay stuck
                // until the month rolled over. Start it again instead.
                if (h.started && !h.interrupt && !h.saved) {
                    run((cb) => ayuStart(threadId, mode, cb));
                    return;
                }
                if (h.started && (h.messages.length || h.interrupt)) {
                    setItems(
                        h.messages.map((m) => ({
                            id: nextId(),
                            kind: m.role === "user" ? "user" : "assistant",
                            text: m.content,
                        }))
                    );
                    if (h.interrupt) {
                        setPending(h.interrupt);
                        setItems((p) => [
                            ...p,
                            { id: nextId(), kind: "interrupt", payload: h.interrupt!, resolved: false },
                        ]);
                    }
                    setBusy(false);
                    scrollEnd();
                    return;
                }
            } catch {
                /* no thread yet — start fresh below */
            }
            run((cb) => ayuStart(threadId, mode, cb));
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId, mode]);

    const resolve = (value: unknown, echo?: string) => {
        if (busy) return;
        setPending(null);
        setAnswer("");
        setEditing(false);
        setEditText("");
        setItems((p) =>
            p.map((it) => (it.kind === "interrupt" ? { ...it, resolved: true } : it))
        );
        if (echo) setItems((p) => [...p, { id: nextId(), kind: "user", text: echo }]);
        scrollEnd();
        run((cb) => ayuResume(threadId, value, cb));
    };

    const renderItem = ({ item }: { item: Item }) => {
        if (item.kind === "user") {
            return (
                <View style={[styles.bubble, styles.userBubble]}>
                    <Text style={styles.userText}>{item.text}</Text>
                </View>
            );
        }
        if (item.kind === "assistant") {
            return (
                <View style={[styles.bubble, styles.aiBubble]}>
                    <FormattedText text={item.text} style={styles.aiText} />
                </View>
            );
        }
        if (item.kind === "system") {
            return (
                <View style={{ marginVertical: 4 }}>
                    <Banner kind={item.tone} message={item.text} />
                </View>
            );
        }

        const p = item.payload;

        if (p.type === "ayu_language") {
            return (
                <View style={[styles.bubble, styles.aiBubble]}>
                    <Text style={styles.aiText}>{p.message}</Text>
                    {!item.resolved && (
                        <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                            {p.options.map((o) => (
                                <Button
                                    key={o.value}
                                    title={o.label}
                                    variant={o.value === "EN" ? "primary" : "secondary"}
                                    style={{ flex: 1 }}
                                    disabled={busy}
                                    onPress={() => resolve(o.value, o.label)}
                                />
                            ))}
                        </View>
                    )}
                </View>
            );
        }

        if (p.type === "ayu_question") {
            return (
                <View style={[styles.bubble, styles.aiBubble]}>
                    <Text style={styles.step}>
                        {p.step} / {p.total}
                    </Text>
                    <FormattedText text={p.question} style={styles.aiText} />
                    {!item.resolved && (
                        <View style={{ marginTop: spacing.sm, gap: 8 }}>
                            <Input
                                placeholder="Your answer…"
                                value={answer}
                                onChangeText={setAnswer}
                                editable={!busy}
                                multiline
                                containerStyle={{ marginBottom: 0 }}
                            />
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                {/* "I don't know" is a first-class button, not
                                    something to type. It records UNKNOWN rather
                                    than a false "none", and making it easy is
                                    what keeps people from guessing. */}
                                <Button
                                    title="I don't know"
                                    variant="secondary"
                                    style={{ flex: 1 }}
                                    disabled={busy}
                                    onPress={() => resolve("I don't know", "I don't know")}
                                />
                                <Button
                                    title="Send"
                                    style={{ flex: 1 }}
                                    disabled={busy || !answer.trim()}
                                    onPress={() => resolve(answer.trim(), answer.trim())}
                                />
                            </View>
                        </View>
                    )}
                </View>
            );
        }

        // ayu_report
        return (
            <View style={[styles.bubble, styles.aiBubble, { maxWidth: "100%" }]}>
                <FormattedText text={p.report} style={styles.aiText} />
                {!item.resolved && (
                    <View style={{ marginTop: spacing.md, gap: 8 }}>
                        <Text style={styles.aiText}>{p.message}</Text>
                        {editing ? (
                            <>
                                <Input
                                    placeholder="What should I change?"
                                    value={editText}
                                    onChangeText={setEditText}
                                    editable={!busy}
                                    containerStyle={{ marginBottom: 0 }}
                                />
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                    <Button
                                        title="Back"
                                        variant="secondary"
                                        style={{ flex: 1 }}
                                        onPress={() => setEditing(false)}
                                        disabled={busy}
                                    />
                                    <Button
                                        title="Change it"
                                        style={{ flex: 1 }}
                                        disabled={busy || !editText.trim()}
                                        onPress={() => resolve({ edit: editText.trim() }, editText.trim())}
                                    />
                                </View>
                            </>
                        ) : (
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <Button
                                    title="Change something"
                                    variant="secondary"
                                    style={{ flex: 1 }}
                                    disabled={busy}
                                    onPress={() => setEditing(true)}
                                />
                                <Button
                                    title="Confirm"
                                    style={{ flex: 1 }}
                                    disabled={busy}
                                    onPress={() => resolve({ confirm: true }, "Confirm")}
                                />
                            </View>
                        )}
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            >
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={6}>
                            <Ionicons name="arrow-back" size={22} color={colors.primaryDark} />
                        </Pressable>
                        <View style={styles.avatar}>
                            <Image
                                source={require("../assets/icon-mark.png")}
                                style={styles.avatarMark}
                                resizeMode="contain"
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>Ayu</Text>
                            <Text style={styles.subtitle}>
                                {mode === "CHECKIN" ? "Monthly check-in" : "Your health assistant"}
                            </Text>
                        </View>
                    </View>

                    <FlatList
                        ref={listRef}
                        data={items}
                        keyExtractor={(i) => i.id}
                        renderItem={renderItem}
                        contentContainerStyle={{ paddingBottom: spacing.md, gap: spacing.sm }}
                        showsVerticalScrollIndicator={false}
                    />

                    {busy && (
                        <View style={styles.thinking}>
                            <ActivityIndicator size="small" color={colors.primaryDark} />
                            <Text style={styles.thinkingText}>{thinking ?? "…"}</Text>
                        </View>
                    )}

                    {!pending && !busy && (
                        <View style={{ paddingBottom: Math.max(insets.bottom, spacing.sm) }}>
                            <Button title="Done" variant="secondary" onPress={() => router.back()} />
                        </View>
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, padding: spacing.lg, paddingBottom: spacing.sm },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.md },
    backBtn: {
        width: 38, height: 38, borderRadius: radius.sm,
        backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center",
    },
    // Light ground: the mark's lower-left shapes are dark green and
    // vanish on colors.primaryDark.
    avatar: {
        width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft,
        alignItems: "center", justifyContent: "center",
    },
    avatarMark: { width: 26, height: 26 },
    title: { fontSize: 19, fontWeight: "800", color: colors.text },
    subtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
    bubble: { borderRadius: radius.md, padding: spacing.md, maxWidth: "92%" },
    userBubble: { backgroundColor: colors.primaryDark, alignSelf: "flex-end" },
    aiBubble: { backgroundColor: colors.surface, alignSelf: "flex-start", ...shadow.card },
    userText: { color: "#fff", fontSize: 14.5, lineHeight: 20 },
    aiText: { color: colors.text, fontSize: 14.5, lineHeight: 20 },
    step: {
        fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6,
        color: colors.textMuted, marginBottom: 4,
    },
    thinking: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 },
    thinkingText: { fontSize: 12.5, color: colors.textMuted },
});
