// ==============================================
// AyuLink Patient - Diagnosis
// Chat front-door to the LangGraph doctor-channeling
// backend: general Q&A, symptom triage against the
// knowledge graph, doctor search, and booking — all
// driven from one conversational thread. Supports PDF
// and image report uploads, and can resume an existing
// thread (continuing a Treatment from Home/Treatments).
// ==============================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
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
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
    type AgentEvent,
    type DoctorCard,
    type InterruptPayload,
    fetchHistory,
    resumeChat,
    sendImage,
    sendMessage,
    sendPdf,
} from "../src/lib/agentChat";
import { Banner, Button, Input } from "../src/components/ui";
import { AttachMenu } from "../src/components/AttachMenu";
import { BookingConfirmModal } from "../src/components/BookingConfirmModal";
import { colors, radius, shadow, spacing } from "../src/theme";

type ChatItem =
    | { id: string; kind: "user"; text: string }
    | { id: string; kind: "assistant"; text: string }
    | { id: string; kind: "interrupt"; payload: InterruptPayload; resolved: boolean }
    | { id: string; kind: "system"; text: string; tone: "error" | "info" };

let idCounter = 0;
const nextId = () => `msg-${Date.now()}-${idCounter++}`;

export default function Diagnosis() {
    const params = useLocalSearchParams<{ threadId?: string }>();
    const continuing = typeof params.threadId === "string" && params.threadId.length > 0;

    const [threadId] = useState(
        () => params.threadId ?? `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const [items, setItems] = useState<ChatItem[]>(
        continuing
            ? []
            : [
                  {
                      id: nextId(),
                      kind: "assistant",
                      text: "Hi! Tell me how you're feeling, ask a question, or attach a medical report to get started.",
                  },
              ]
    );
    const [hydrating, setHydrating] = useState(continuing);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [awaitingInterrupt, setAwaitingInterrupt] = useState<InterruptPayload | null>(null);
    const [pendingBooking, setPendingBooking] = useState<DoctorCard | null>(null);
    const [attachMenuVisible, setAttachMenuVisible] = useState(false);
    const currentAssistantId = useRef<string | null>(null);
    const listRef = useRef<FlatList<ChatItem>>(null);
    const insets = useSafeAreaInsets();

    const scrollToEnd = () => {
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    };

    useEffect(() => {
        if (!continuing) return;
        (async () => {
            try {
                const history = await fetchHistory(threadId);
                const hydrated: ChatItem[] = history.messages.map((m) => ({
                    id: nextId(),
                    kind: m.role === "user" ? "user" : "assistant",
                    text: m.content,
                }));
                if (history.interrupt) {
                    hydrated.push({ id: nextId(), kind: "interrupt", payload: history.interrupt, resolved: false });
                    setAwaitingInterrupt(history.interrupt);
                }
                setItems(hydrated.length ? hydrated : [
                    { id: nextId(), kind: "assistant", text: "Welcome back — let's continue where we left off." },
                ]);
            } catch (e) {
                setItems([
                    {
                        id: nextId(),
                        kind: "system",
                        tone: "error",
                        text: e instanceof Error ? e.message : "Couldn't load this conversation",
                    },
                ]);
            } finally {
                setHydrating(false);
                scrollToEnd();
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [continuing, threadId]);

    const handleEvent = useCallback((evt: AgentEvent) => {
        switch (evt.event) {
            case "token": {
                if (!currentAssistantId.current) {
                    const id = nextId();
                    currentAssistantId.current = id;
                    setItems((prev) => [...prev, { id, kind: "assistant", text: evt.data.content }]);
                } else {
                    const id = currentAssistantId.current;
                    setItems((prev) =>
                        prev.map((it) =>
                            it.id === id && it.kind === "assistant"
                                ? { ...it, text: it.text + evt.data.content }
                                : it
                        )
                    );
                }
                scrollToEnd();
                break;
            }
            case "interrupt": {
                currentAssistantId.current = null;
                setAwaitingInterrupt(evt.data);
                setItems((prev) => [
                    ...prev,
                    { id: nextId(), kind: "interrupt", payload: evt.data, resolved: false },
                ]);
                scrollToEnd();
                break;
            }
            case "error": {
                currentAssistantId.current = null;
                setItems((prev) => [
                    ...prev,
                    { id: nextId(), kind: "system", tone: "error", text: evt.data.message },
                ]);
                break;
            }
            case "done": {
                currentAssistantId.current = null;
                break;
            }
            default:
                break;
        }
    }, []);

    const runStream = useCallback(
        async (fn: (onEvent: (e: AgentEvent) => void) => Promise<void>) => {
            setBusy(true);
            currentAssistantId.current = null;
            try {
                await fn(handleEvent);
            } catch (e) {
                setItems((prev) => [
                    ...prev,
                    {
                        id: nextId(),
                        kind: "system",
                        tone: "error",
                        text: e instanceof Error ? e.message : "Something went wrong",
                    },
                ]);
            } finally {
                setBusy(false);
            }
        },
        [handleEvent]
    );

    const send = useCallback(() => {
        const text = input.trim();
        if (!text || busy) return;
        setInput("");
        setItems((prev) => [...prev, { id: nextId(), kind: "user", text }]);
        scrollToEnd();
        runStream((onEvent) => sendMessage(threadId, text, onEvent));
    }, [input, busy, threadId, runStream]);

    const resolveInterrupt = useCallback(
        (value: unknown, label?: string) => {
            if (busy) return;
            setAwaitingInterrupt(null);
            setItems((prev) => prev.map((it) => (it.kind === "interrupt" ? { ...it, resolved: true } : it)));
            if (label) {
                setItems((prev) => [...prev, { id: nextId(), kind: "user", text: label }]);
            }
            scrollToEnd();
            runStream((onEvent) => resumeChat(threadId, value, onEvent));
        },
        [busy, threadId, runStream]
    );

    const confirmBooking = useCallback(() => {
        if (!pendingBooking) return;
        const doc = pendingBooking;
        setPendingBooking(null);
        resolveInterrupt(
            { doctor_schedule_id: doc.doctor_schedule_id, date: doc.date },
            `Book Dr. ${doc.first_name} ${doc.last_name} — ${doc.date}`
        );
    }, [pendingBooking, resolveInterrupt]);

    const attachReport = useCallback(async () => {
        if (busy) return;
        const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
        if (result.canceled || !result.assets?.[0]) return;
        const file = result.assets[0];
        setItems((prev) => [...prev, { id: nextId(), kind: "user", text: `📎 ${file.name}` }]);
        scrollToEnd();
        runStream((onEvent) => sendPdf(threadId, file.uri, file.name, onEvent));
    }, [busy, threadId, runStream]);

    const attachImage = useCallback(async () => {
        if (busy) return;
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return;
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.8,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        const name = asset.fileName ?? "photo.jpg";
        const mime = asset.mimeType ?? "image/jpeg";
        setItems((prev) => [...prev, { id: nextId(), kind: "user", text: `🖼️ ${name}` }]);
        scrollToEnd();
        runStream((onEvent) => sendImage(threadId, asset.uri, name, mime, onEvent));
    }, [busy, threadId, runStream]);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            >
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Pressable onPress={() => router.back()} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={22} color={colors.primaryDark} />
                        </Pressable>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.headerTitle}>Diagnosis</Text>
                            <Text style={styles.headerSubtitle}>
                                {continuing ? "Continuing your conversation" : "Tell me what's going on"}
                            </Text>
                        </View>
                    </View>

                    {hydrating ? (
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <ActivityIndicator size="large" color={colors.primaryDark} />
                        </View>
                    ) : (
                        <FlatList
                            ref={listRef}
                            data={items}
                            keyExtractor={(it) => it.id}
                            renderItem={({ item }) => (
                                <ChatBubble
                                    item={item}
                                    onResolveInterrupt={resolveInterrupt}
                                    onRequestBooking={setPendingBooking}
                                    busy={busy}
                                />
                            )}
                            contentContainerStyle={{ paddingBottom: spacing.md, gap: spacing.sm }}
                            showsVerticalScrollIndicator={false}
                        />
                    )}

                    {busy && (
                        <View style={styles.thinkingRow}>
                            <ActivityIndicator size="small" color={colors.primaryDark} />
                            <Text style={styles.thinkingText}>Thinking…</Text>
                        </View>
                    )}

                    <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
                        <Pressable
                            style={styles.attachButton}
                            onPress={() => setAttachMenuVisible(true)}
                            disabled={busy}
                            hitSlop={4}
                        >
                            <Ionicons name="add" size={24} color={colors.primaryDark} />
                        </Pressable>
                        <Input
                            containerStyle={styles.textInputContainer}
                            style={styles.textInput}
                            placeholder={awaitingInterrupt ? "Respond above first…" : "Describe how you feel…"}
                            value={input}
                            onChangeText={setInput}
                            editable={!busy && !awaitingInterrupt}
                            onSubmitEditing={send}
                            returnKeyType="send"
                            multiline={false}
                            textAlignVertical="center"
                            cursorColor={colors.primaryDark}
                            selectionColor={colors.primaryDark}
                        />
                        <Pressable
                            style={[styles.sendButton, (busy || !input.trim() || !!awaitingInterrupt) && { opacity: 0.5 }]}
                            onPress={send}
                            disabled={busy || !input.trim() || !!awaitingInterrupt}
                            hitSlop={4}
                        >
                            <Ionicons name="send" size={18} color="#fff" />
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>

            <AttachMenu
                visible={attachMenuVisible}
                onClose={() => setAttachMenuVisible(false)}
                onPickImage={attachImage}
                onPickDocument={attachReport}
            />

            <BookingConfirmModal
                doctor={pendingBooking}
                busy={busy}
                onConfirm={confirmBooking}
                onCancel={() => setPendingBooking(null)}
            />
        </SafeAreaView>
    );
}

function ChatBubble({
    item,
    onResolveInterrupt,
    onRequestBooking,
    busy,
}: {
    item: ChatItem;
    onResolveInterrupt: (value: unknown, label?: string) => void;
    onRequestBooking: (doctor: DoctorCard) => void;
    busy: boolean;
}) {
    if (item.kind === "user") {
        return (
            <View style={[styles.bubble, styles.userBubble]}>
                <Text style={styles.userText}>{item.text}</Text>
            </View>
        );
    }
    if (item.kind === "assistant") {
        return (
            <View style={[styles.bubble, styles.assistantBubble]}>
                <Text style={styles.assistantText}>{item.text}</Text>
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
    return (
        <InterruptCard
            payload={item.payload}
            resolved={item.resolved}
            busy={busy}
            onResolve={onResolveInterrupt}
            onRequestBooking={onRequestBooking}
        />
    );
}

function InterruptCard({
    payload,
    resolved,
    busy,
    onResolve,
    onRequestBooking,
}: {
    payload: InterruptPayload;
    resolved: boolean;
    busy: boolean;
    onResolve: (value: unknown, label?: string) => void;
    onRequestBooking: (doctor: DoctorCard) => void;
}) {
    const [text, setText] = useState("");
    const [city, setCity] = useState("");
    const [time, setTime] = useState("");

    if (payload.type === "ask_followup") {
        return (
            <View style={[styles.bubble, styles.assistantBubble]}>
                <Text style={styles.assistantText}>{payload.question}</Text>
                {!resolved && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                        <Input
                            containerStyle={{ flex: 1, minWidth: 0, marginBottom: 0 }}
                            placeholder="Your answer…"
                            value={text}
                            onChangeText={setText}
                            editable={!busy}
                            textAlignVertical="center"
                            cursorColor={colors.primaryDark}
                        />
                        <Button
                            title="Send"
                            onPress={() => text.trim() && onResolve(text.trim(), text.trim())}
                            disabled={busy || !text.trim()}
                        />
                    </View>
                )}
            </View>
        );
    }

    if (payload.type === "offer_doctor") {
        return (
            <View style={[styles.bubble, styles.assistantBubble]}>
                <Text style={styles.assistantText}>{payload.message}</Text>
                {!resolved && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                        <Button title="Yes" onPress={() => onResolve("yes", "Yes")} disabled={busy} style={{ flex: 1 }} />
                        <Button
                            title="No"
                            variant="secondary"
                            onPress={() => onResolve("no", "No")}
                            disabled={busy}
                            style={{ flex: 1 }}
                        />
                    </View>
                )}
            </View>
        );
    }

    if (payload.type === "ask_location_time") {
        return (
            <View style={[styles.bubble, styles.assistantBubble]}>
                <Text style={styles.assistantText}>{payload.message}</Text>
                {!resolved && (
                    <View style={{ marginTop: spacing.sm, gap: 8 }}>
                        <Input placeholder="City (default: nearest)" value={city} onChangeText={setCity} editable={!busy} />
                        <Input placeholder="Preferred date/time (optional)" value={time} onChangeText={setTime} editable={!busy} />
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <Button
                                title="Use nearest"
                                variant="secondary"
                                onPress={() => onResolve({ location: null, time: null }, "Use nearest available")}
                                disabled={busy}
                                style={{ flex: 1 }}
                            />
                            <Button
                                title="Apply"
                                onPress={() =>
                                    onResolve(
                                        { location: city.trim() || null, time: time.trim() || null },
                                        [city, time].filter(Boolean).join(", ") || "Applied preferences"
                                    )
                                }
                                disabled={busy}
                                style={{ flex: 1 }}
                            />
                        </View>
                    </View>
                )}
            </View>
        );
    }

    // present_top5
    return (
        <View style={{ gap: spacing.sm }}>
            {payload.doctors.length === 0 && (
                <View style={[styles.bubble, styles.assistantBubble]}>
                    <Text style={styles.assistantText}>
                        I couldn't find any matching doctors with availability right now.
                    </Text>
                </View>
            )}
            {payload.doctors.map((doc, i) => (
                <DoctorResultCard
                    key={`${doc.doctor_schedule_id}-${i}`}
                    doctor={doc}
                    disabled={resolved || busy}
                    onBook={() => onRequestBooking(doc)}
                />
            ))}
        </View>
    );
}

function DoctorResultCard({
    doctor,
    disabled,
    onBook,
}: {
    doctor: DoctorCard;
    disabled: boolean;
    onBook: () => void;
}) {
    return (
        <View style={styles.doctorCard}>
            <View style={{ flex: 1 }}>
                <Text style={styles.doctorName}>
                    Dr. {doctor.first_name} {doctor.last_name}
                </Text>
                <Text style={styles.doctorMeta}>{doctor.specialty}</Text>
                {doctor.rating != null && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <Ionicons name="star" size={12} color={colors.warning} />
                        <Text style={styles.doctorMeta}>{doctor.rating.toFixed(1)}</Text>
                    </View>
                )}
                {doctor.channeling_center_name && (
                    <Text style={styles.doctorMeta} numberOfLines={1}>
                        {doctor.channeling_center_name}
                        {doctor.city ? ` · ${doctor.city}` : ""}
                    </Text>
                )}
                {doctor.date && (
                    <Text style={styles.doctorSlot}>
                        {doctor.date} · {doctor.start_time}–{doctor.end_time}
                    </Text>
                )}
            </View>
            <Button title="Book Now" onPress={onBook} disabled={disabled || !doctor.doctor_schedule_id} />
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, padding: spacing.lg, paddingBottom: spacing.sm },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.md },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: radius.sm,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: { fontSize: 20, fontWeight: "800", color: colors.text },
    headerSubtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
    bubble: {
        borderRadius: radius.md,
        padding: spacing.md,
        maxWidth: "88%",
    },
    userBubble: {
        backgroundColor: colors.primary,
        alignSelf: "flex-end",
    },
    assistantBubble: {
        backgroundColor: colors.surface,
        alignSelf: "flex-start",
        maxWidth: "95%",
        ...shadow.card,
    },
    userText: { color: "#fff", fontSize: 14.5, lineHeight: 20 },
    assistantText: { color: colors.text, fontSize: 14.5, lineHeight: 20 },
    thinkingRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 },
    thinkingText: { fontSize: 12.5, color: colors.textMuted },
    inputRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingTop: spacing.sm,
    },
    // minWidth: 0 is the key line — without it, a flex row refuses to
    // shrink this below the TextInput's natural content width, which is
    // exactly what was collapsing it to ~0px next to the fixed-size
    // buttons. flexShrink lets it give way on narrow screens too.
    textInputContainer: { flex: 1, minWidth: 0, flexShrink: 1, marginBottom: 0 },
    textInput: { flexShrink: 1 },
    attachButton: {
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: radius.sm,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
    },
    sendButton: {
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: radius.sm,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    doctorCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        ...shadow.card,
    },
    doctorName: { fontSize: 14.5, fontWeight: "700", color: colors.text },
    doctorMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    doctorSlot: { fontSize: 12, fontWeight: "600", color: colors.primaryDark, marginTop: 4 },
});
