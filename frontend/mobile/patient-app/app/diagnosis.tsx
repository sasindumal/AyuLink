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
import * as Speech from "expo-speech";
import {
    type AgentEvent,
    type DoctorCard,
    type DispensedDrug,
    type InterruptPayload,
    fetchHistory,
    resumeChat,
    sendImage,
    sendMessage,
    sendPdf,
    startCourseFollowup,
    syncCareEvents,
} from "../src/lib/agentChat";
import { Banner, Button, Input, formatDate } from "../src/components/ui";
import { FormattedText } from "../src/components/FormattedText";
import { AttachMenu } from "../src/components/AttachMenu";
import { DoctorRatingInput } from "../src/components/DoctorRatingInput";
import { PreferencePicker } from "../src/components/PreferencePicker";
import { SlotPicker, formatClock, type PickerSlot } from "../src/components/SlotPicker";
import { VoiceControl } from "../src/components/VoiceControl";
import {
    cancelCourseReminders,
    hasCourseReminders,
    scheduleCourseReminders,
} from "../src/lib/reminders";
import { colors, radius, shadow, spacing } from "../src/theme";

const VOICE_LANG = "en-US";

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
    // Ephemeral only — set from the SSE "thinking" event, never written into
    // `items`. The backend never persists this to graph state/history either
    // (see src/agent_workflow/retrevel/streaming.py), so it exists purely
    // for this one render while a structured-output LLM call is in flight.
    const [thinkingMessage, setThinkingMessage] = useState<string | null>(null);
    const [awaitingInterrupt, setAwaitingInterrupt] = useState<InterruptPayload | null>(null);
    // The slot picker opens itself the moment a choose_slot interrupt
    // lands (tapping "Book" on a doctor card is what triggers it), and can
    // be reopened from the inline card if it's dismissed by accident.
    const [slotPickerOpen, setSlotPickerOpen] = useState(false);
    const [attachMenuVisible, setAttachMenuVisible] = useState(false);
    // Care-journey state, refreshed by syncCareEvents on open.
    const [courseEndsAt, setCourseEndsAt] = useState<string | null>(null);
    const [treatmentId, setTreatmentId] = useState<string | null>(null);
    const [dispensedDrugs, setDispensedDrugs] = useState<DispensedDrug[]>([]);
    const [remindersOn, setRemindersOn] = useState(false);
    const [schedulingReminders, setSchedulingReminders] = useState(false);
    const [voiceMode, setVoiceMode] = useState(false);
    const [listening, setListening] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState("");
    const currentAssistantId = useRef<string | null>(null);
    const currentAssistantText = useRef("");
    const voiceModeRef = useRef(false);
    const listRef = useRef<FlatList<ChatItem>>(null);
    const insets = useSafeAreaInsets();

    useEffect(() => {
        voiceModeRef.current = voiceMode;
        if (!voiceMode) Speech.stop();
    }, [voiceMode]);

    useEffect(() => {
        // Stop any in-flight speech when leaving this screen.
        return () => {
            Speech.stop();
        };
    }, []);

    const scrollToEnd = () => {
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    };

    useEffect(() => {
        if (!continuing) return;
        (async () => {
            try {
                // Fold in anything that happened outside the chat since we
                // were last here — the doctor starting the visit, the
                // prescription issued, drugs dispensed — BEFORE reading
                // history, so those messages are already part of what we
                // load. Idempotent server-side, so this is safe on every
                // open. Best-effort: a sync failure must never stop an
                // existing conversation from opening.
                try {
                    const sync = await syncCareEvents(threadId);
                    setCourseEndsAt(sync.courseEndsAt);
                    setTreatmentId(sync.treatmentId ?? null);
                    setDispensedDrugs(sync.drugs ?? []);
                    if (sync.treatmentId) {
                        setRemindersOn(await hasCourseReminders(sync.treatmentId));
                    }
                } catch {
                    // offline, or backend still waking — history still loads
                }

                const history = await fetchHistory(threadId);
                const hydrated: ChatItem[] = history.messages.map((m) => ({
                    id: nextId(),
                    kind: m.role === "user" ? "user" : "assistant",
                    text: m.content,
                }));
                if (history.interrupt) {
                    hydrated.push({ id: nextId(), kind: "interrupt", payload: history.interrupt, resolved: false });
                    setAwaitingInterrupt(history.interrupt);
                    if (history.interrupt.type === "choose_slot") setSlotPickerOpen(true);
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

    const speak = useCallback((text: string) => {
        if (!voiceModeRef.current || !text.trim()) return;
        Speech.stop();
        setSpeaking(true);
        Speech.speak(text, {
            language: VOICE_LANG,
            onDone: () => setSpeaking(false),
            onStopped: () => setSpeaking(false),
            onError: () => setSpeaking(false),
        });
    }, []);

    const interruptSpeechText = (payload: InterruptPayload): string => {
        switch (payload.type) {
            case "ask_followup":
            case "course_followup":
                return payload.question;
            case "offer_doctor":
            case "ask_location_time":
            case "offer_complete_treatment":
            case "offer_followup_booking":
            case "rate_doctor":
                return payload.message;
            case "present_top5":
                return payload.doctors.length
                    ? `${payload.note ? `${payload.note} ` : ""}I found ${payload.doctors.length} matching doctor${payload.doctors.length === 1 ? "" : "s"}. Take a look and tap Book on the one you'd like.`
                    : "I couldn't find any matching doctors with availability right now.";
            case "choose_slot":
                return payload.message;
            default:
                return "";
        }
    };

    // Speaks whatever assistant text just finished streaming (if any),
    // then clears the turn's accumulator — shared by interrupt/error/done.
    const finishAssistantTurn = () => {
        if (currentAssistantText.current) speak(currentAssistantText.current);
        currentAssistantId.current = null;
        currentAssistantText.current = "";
        setThinkingMessage(null);
    };

    const handleEvent = useCallback((evt: AgentEvent) => {
        switch (evt.event) {
            case "thinking": {
                setThinkingMessage(evt.data.message);
                break;
            }
            case "token": {
                setThinkingMessage(null);
                currentAssistantText.current += evt.data.content;
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
                finishAssistantTurn();
                setAwaitingInterrupt(evt.data);
                if (evt.data.type === "choose_slot") setSlotPickerOpen(true);
                setItems((prev) => [
                    ...prev,
                    { id: nextId(), kind: "interrupt", payload: evt.data, resolved: false },
                ]);
                scrollToEnd();
                speak(interruptSpeechText(evt.data));
                break;
            }
            case "error": {
                finishAssistantTurn();
                setItems((prev) => [
                    ...prev,
                    { id: nextId(), kind: "system", tone: "error", text: evt.data.message },
                ]);
                break;
            }
            case "done": {
                finishAssistantTurn();
                break;
            }
            default:
                break;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [speak]);

    const runStream = useCallback(
        async (fn: (onEvent: (e: AgentEvent) => void) => Promise<void>) => {
            setBusy(true);
            currentAssistantId.current = null;
            currentAssistantText.current = "";
            setThinkingMessage(null);
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

    const sendText = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed || busy) return;
            setInput("");
            setItems((prev) => [...prev, { id: nextId(), kind: "user", text: trimmed }]);
            scrollToEnd();
            runStream((onEvent) => sendMessage(threadId, trimmed, onEvent));
        },
        [busy, threadId, runStream]
    );

    const send = useCallback(() => sendText(input), [input, sendText]);

    // Once the medication course has run out, open the check-in ("how are
    // you feeling now?"). The OS notification scheduled for courseEndsAt
    // is what brings most people back here; this covers the case where
    // they simply open the app themselves. Only fires when the chat is
    // idle and isn't already waiting on an answer, so it can never
    // interrupt something the patient is mid-way through.
    /** Turn dose reminders on/off for this course. The reminder wording is
     *  written by the assistant (so it reads naturally, and in the
     *  patient's own language); the OS handles the actual delivery. */
    const toggleReminders = useCallback(async () => {
        if (!treatmentId || schedulingReminders) return;
        setSchedulingReminders(true);
        try {
            if (remindersOn) {
                await cancelCourseReminders(treatmentId);
                setRemindersOn(false);
                setItems((prev) => [
                    ...prev,
                    { id: nextId(), kind: "system", tone: "info", text: "Medication reminders turned off." },
                ]);
                return;
            }

            // Fall back to a plain dosage line per drug if the assistant
            // can't be reached — reminders are more useful than pretty.
            const messages: Record<string, string> = {};
            for (const drug of dispensedDrugs) {
                messages[drug.drugName] = [drug.dosage, drug.frequency, drug.instructions]
                    .filter(Boolean)
                    .join(" · ");
            }

            const count = await scheduleCourseReminders(
                treatmentId,
                dispensedDrugs,
                messages,
                courseEndsAt,
                threadId
            );
            if (count === 0) {
                setItems((prev) => [
                    ...prev,
                    {
                        id: nextId(),
                        kind: "system",
                        tone: "error",
                        text: "I couldn't set reminders — notifications are turned off for AyuLink in your phone settings.",
                    },
                ]);
                return;
            }
            setRemindersOn(true);
            setItems((prev) => [
                ...prev,
                {
                    id: nextId(),
                    kind: "system",
                    tone: "info",
                    text: `Reminders set — I'll nudge you for each dose, and check in when your course finishes.`,
                },
            ]);
        } finally {
            setSchedulingReminders(false);
            scrollToEnd();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [treatmentId, remindersOn, dispensedDrugs, courseEndsAt, schedulingReminders]);

    const followupStarted = useRef(false);
    useEffect(() => {
        if (hydrating || busy || awaitingInterrupt || followupStarted.current) return;
        if (!courseEndsAt) return;
        if (new Date(courseEndsAt).getTime() > Date.now()) return;

        followupStarted.current = true;
        runStream((onEvent) => startCourseFollowup(threadId, onEvent));
    }, [hydrating, busy, awaitingInterrupt, courseEndsAt, threadId, runStream]);

    const resolveInterrupt = useCallback(
        (value: unknown, label?: string) => {
            if (busy) return;
            setAwaitingInterrupt(null);
            setSlotPickerOpen(false);
            setItems((prev) => prev.map((it) => (it.kind === "interrupt" ? { ...it, resolved: true } : it)));
            if (label) {
                setItems((prev) => [...prev, { id: nextId(), kind: "user", text: label }]);
            }
            scrollToEnd();
            runStream((onEvent) => resumeChat(threadId, value, onEvent));
        },
        [busy, threadId, runStream]
    );

    // Voice mode's single entry point for a finished transcript — routes
    // to a fresh message or an ask_followup answer, whichever the current
    // turn expects, exactly like the text bar would.
    const submitVoiceTranscript = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            if (awaitingInterrupt?.type === "ask_followup" || awaitingInterrupt?.type === "course_followup") {
                resolveInterrupt(trimmed, trimmed);
            } else if (!awaitingInterrupt) {
                sendText(trimmed);
            }
        },
        [awaitingInterrupt, resolveInterrupt, sendText]
    );

    // Voice INPUT (mic listening) is a placeholder for now — it needs a
    // speech-recognition module, which (unlike expo-speech for playback)
    // isn't part of Expo's own bundled module set and requires a custom
    // dev client rebuild. Deferred until that's set up; submitVoiceTranscript
    // above is already wired and ready to receive a transcript once real
    // recognition is added back here.
    const startListening = useCallback(() => {
        setItems((prev) => [
            ...prev,
            {
                id: nextId(),
                kind: "system",
                tone: "info",
                text: "🎙️ Voice input is coming soon — switch back to text for now.",
            },
        ]);
        scrollToEnd();
    }, []);

    const stopListening = useCallback(() => {}, []);

    // Tapping "Book" on a shortlist card commits nothing — it asks the
    // graph for that doctor's full schedule (choose_slot), which arrives
    // as the next interrupt and opens the picker.
    const requestSlots = useCallback(
        (doctor: DoctorCard) => {
            resolveInterrupt(
                { doctor_id: doctor.doctor_id },
                `Show me Dr. ${doctor.first_name} ${doctor.last_name}'s times`
            );
        },
        [resolveInterrupt]
    );

    const confirmSlot = useCallback(
        (slot: PickerSlot) => {
            resolveInterrupt(
                { doctor_schedule_id: slot.doctorScheduleId, date: slot.date },
                `Confirm ${formatDate(slot.date)} · ${formatClock(slot.startTime)}`
            );
        },
        [resolveInterrupt]
    );

    // Backing out of the picker returns to the shortlist rather than
    // leaving the turn stranded on an interrupt nobody can answer.
    const cancelSlotPicker = useCallback(() => {
        setSlotPickerOpen(false);
        resolveInterrupt({ cancelled: true }, "Show me the other doctors");
    }, [resolveInterrupt]);

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
                                {voiceMode
                                    ? "Voice chat"
                                    : continuing
                                      ? "Continuing your conversation"
                                      : "Tell me what's going on"}
                            </Text>
                        </View>
                        <Pressable
                            onPress={() => setVoiceMode((v) => !v)}
                            style={[styles.backBtn, voiceMode && styles.voiceToggleActive]}
                        >
                            <Ionicons
                                name={voiceMode ? "chatbox-ellipses" : "mic"}
                                size={20}
                                color={voiceMode ? "#fff" : colors.primaryDark}
                            />
                        </Pressable>
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
                                    onRequestBooking={requestSlots}
                                    onOpenSlotPicker={() => setSlotPickerOpen(true)}
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
                            <Text style={styles.thinkingText}>{thinkingMessage ?? "Thinking…"}</Text>
                        </View>
                    )}

                    {dispensedDrugs.length > 0 && !busy && (
                        <Pressable
                            style={styles.reminderBar}
                            onPress={toggleReminders}
                            disabled={schedulingReminders}
                        >
                            <Ionicons
                                name={remindersOn ? "alarm" : "alarm-outline"}
                                size={18}
                                color={colors.primaryDark}
                            />
                            <Text style={styles.reminderText}>
                                {schedulingReminders
                                    ? "Updating reminders…"
                                    : remindersOn
                                      ? `Dose reminders are on for ${dispensedDrugs.length} medication${dispensedDrugs.length === 1 ? "" : "s"} — tap to turn off`
                                      : `Remind me to take my ${dispensedDrugs.length === 1 ? "medication" : "medications"}`}
                            </Text>
                            {!schedulingReminders && (
                                <Ionicons
                                    name={remindersOn ? "close-circle-outline" : "chevron-forward"}
                                    size={16}
                                    color={colors.textMuted}
                                />
                            )}
                        </Pressable>
                    )}

                    {voiceMode ? (
                        <View style={{ paddingBottom: Math.max(insets.bottom, spacing.sm) }}>
                            <VoiceControl
                                listening={listening}
                                speaking={speaking}
                                disabled={
                                    busy ||
                                    (!!awaitingInterrupt &&
                                        awaitingInterrupt.type !== "ask_followup" &&
                                        awaitingInterrupt.type !== "course_followup")
                                }
                                disabledReason={busy ? (thinkingMessage ?? "Thinking…") : "Respond above first…"}
                                interimTranscript={interimTranscript}
                                onStart={startListening}
                                onStop={stopListening}
                            />
                        </View>
                    ) : (
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
                    )}
                </View>
            </KeyboardAvoidingView>

            <AttachMenu
                visible={attachMenuVisible}
                onClose={() => setAttachMenuVisible(false)}
                onPickImage={attachImage}
                onPickDocument={attachReport}
            />

            {awaitingInterrupt?.type === "choose_slot" && (
                <SlotPicker
                    visible={slotPickerOpen}
                    doctor={awaitingInterrupt.doctor}
                    slots={awaitingInterrupt.slots}
                    preselected={awaitingInterrupt.preselected}
                    message={awaitingInterrupt.message}
                    busy={busy}
                    onConfirm={confirmSlot}
                    onCancel={cancelSlotPicker}
                />
            )}
        </SafeAreaView>
    );
}

function ChatBubble({
    item,
    onResolveInterrupt,
    onRequestBooking,
    onOpenSlotPicker,
    busy,
}: {
    item: ChatItem;
    onResolveInterrupt: (value: unknown, label?: string) => void;
    onRequestBooking: (doctor: DoctorCard) => void;
    onOpenSlotPicker: () => void;
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
                <FormattedText text={item.text} style={styles.assistantText} />
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
            onOpenSlotPicker={onOpenSlotPicker}
        />
    );
}

function InterruptCard({
    payload,
    resolved,
    busy,
    onResolve,
    onRequestBooking,
    onOpenSlotPicker,
}: {
    payload: InterruptPayload;
    resolved: boolean;
    busy: boolean;
    onResolve: (value: unknown, label?: string) => void;
    onRequestBooking: (doctor: DoctorCard) => void;
    onOpenSlotPicker: () => void;
}) {
    const [text, setText] = useState("");

    if (payload.type === "ask_followup" || payload.type === "course_followup") {
        return (
            <View style={[styles.bubble, styles.assistantBubble]}>
                <FormattedText text={payload.question} style={styles.assistantText} />
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
                <FormattedText text={payload.message} style={styles.assistantText} />
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

    if (payload.type === "offer_complete_treatment") {
        return (
            <View style={[styles.bubble, styles.assistantBubble]}>
                <FormattedText text={payload.message} style={styles.assistantText} />
                {!resolved && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                        <Button title="Yes" onPress={() => onResolve("yes", "Yes")} disabled={busy} style={{ flex: 1 }} />
                        <Button
                            title="Not yet"
                            variant="secondary"
                            onPress={() => onResolve("no", "Not yet")}
                            disabled={busy}
                            style={{ flex: 1 }}
                        />
                    </View>
                )}
            </View>
        );
    }

    if (payload.type === "offer_followup_booking") {
        return (
            <View style={[styles.bubble, styles.assistantBubble]}>
                <FormattedText text={payload.message} style={styles.assistantText} />
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

    if (payload.type === "rate_doctor") {
        return (
            <View style={[styles.bubble, styles.assistantBubble]}>
                <FormattedText text={payload.message} style={styles.assistantText} />
                {!resolved && (
                    <DoctorRatingInput
                        busy={busy}
                        onSubmit={(rating, feedback) =>
                            onResolve(
                                { rating, feedback: feedback || null },
                                `${"⭐".repeat(rating)} (${rating}/5)${feedback ? ` — ${feedback}` : ""}`
                            )
                        }
                        onSkip={() => onResolve({ skip: true }, "Skip")}
                    />
                )}
            </View>
        );
    }

    if (payload.type === "ask_location_time") {
        return (
            <View style={[styles.bubble, styles.assistantBubble]}>
                <FormattedText text={payload.message} style={styles.assistantText} />
                {!resolved && (
                    <PreferencePicker
                        cities={payload.cities ?? []}
                        minDate={payload.min_date}
                        maxDate={payload.max_date}
                        timeBands={payload.time_bands ?? ["morning", "afternoon", "evening"]}
                        busy={busy}
                        onSubmit={(value, label) => onResolve(value, label)}
                    />
                )}
            </View>
        );
    }

    if (payload.type === "choose_slot") {
        // The picker itself is a sheet (see SlotPicker in the screen body);
        // this card is its anchor in the transcript, so a dismissed sheet
        // is one tap from coming back rather than a dead end.
        return (
            <View style={[styles.bubble, styles.assistantBubble]}>
                <FormattedText text={payload.message} style={styles.assistantText} />
                {!resolved && (
                    <Button
                        title="Pick a time"
                        icon="calendar-outline"
                        onPress={onOpenSlotPicker}
                        disabled={busy}
                        style={{ marginTop: spacing.sm }}
                    />
                )}
            </View>
        );
    }

    // present_top5
    return (
        <View style={{ gap: spacing.sm }}>
            {payload.note ? (
                <View style={[styles.bubble, styles.assistantBubble]}>
                    <Text style={styles.noteText}>{payload.note}</Text>
                </View>
            ) : null}
            {payload.doctors.length === 0 && (
                <View style={[styles.bubble, styles.assistantBubble]}>
                    <Text style={styles.assistantText}>
                        I couldn't find any matching doctors with availability right now.
                        Tell me another city or day and I'll look again.
                    </Text>
                </View>
            )}
            {payload.doctors.map((doc, i) => (
                <DoctorResultCard
                    key={`${doc.doctor_id ?? doc.doctor_schedule_id}-${i}`}
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
                {doctor.city && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                        <Text style={styles.doctorCity}>{doctor.city}</Text>
                    </View>
                )}
                {doctor.channeling_center_name && (
                    <Text style={styles.doctorMeta} numberOfLines={1}>
                        {doctor.channeling_center_name}
                    </Text>
                )}
                {doctor.date && (
                    // Labelled "Earliest" because tapping Book no longer
                    // takes this slot — it opens the full schedule with
                    // this one preselected, so this is a preview, not a
                    // commitment.
                    <Text style={styles.doctorSlot}>
                        Earliest: {formatDate(doctor.date)} · {formatClock(doctor.start_time)}
                    </Text>
                )}
            </View>
            <Button title="Book" onPress={onBook} disabled={disabled || !doctor.doctor_id} />
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
    voiceToggleActive: { backgroundColor: colors.primary },
    headerTitle: { fontSize: 20, fontWeight: "800", color: colors.text },
    headerSubtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
    bubble: {
        borderRadius: radius.md,
        padding: spacing.md,
        maxWidth: "88%",
    },
    userBubble: {
        // primaryDark, not primary — white 14.5px message text on #48A111
        // was 3.29:1, failing AA; #25671E passes at 6.91:1.
        backgroundColor: colors.primaryDark,
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
    // The "these aren't quite what you asked for" line above the shortlist.
    noteText: { color: colors.warningInk, fontSize: 13.5, lineHeight: 19, fontWeight: "600" },
    thinkingRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 },
    reminderBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.primarySoft,
        borderRadius: radius.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: spacing.sm,
    },
    reminderText: {
        flex: 1,
        fontSize: 12.5,
        fontWeight: "700",
        color: colors.primaryDark,
        lineHeight: 17,
    },
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
    // Its own row + icon + bolder weight than doctorMeta — city matters
    // for an in-person appointment and used to get silently truncated
    // when crammed onto the same numberOfLines={1} line as a long
    // channeling center name.
    doctorCity: { fontSize: 12.5, fontWeight: "700", color: colors.primaryDark },
    doctorSlot: { fontSize: 12, fontWeight: "600", color: colors.primaryDark, marginTop: 4 },
});
