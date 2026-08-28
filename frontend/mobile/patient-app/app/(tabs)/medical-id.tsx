// ==============================================
// AyuLink Patient - Digital Medical ID
// Full-size QR code + usage guide
// ==============================================

import React, { useCallback, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, spacing, statusMeta, type } from "../../src/theme";
import { Card, ScreenHeader } from "../../src/components/ui";
import type { Prescription } from "../../src/types";

const STEPS = [
    { title: "Visit a Doctor", text: "Show this QR code so the doctor can access your records." },
    { title: "Receive a Digital Prescription", text: "The doctor links the prescription to your Medical ID." },
    { title: "Visit a Pharmacy", text: "The pharmacist scans your QR to see active prescriptions." },
    { title: "Collect Your Medication", text: "Each medicine is dispensed and marked on your record." },
];

const ACTIVE_STATUSES = new Set(["NOT_DISPENSED", "PARTIALLY_DISPENSED"]);

export default function MedicalId() {
    const { user } = useAuth();
    const [copied, setCopied] = useState(false);
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);

    // This screen is used standing at a pharmacy counter — the one thing
    // worth knowing there, besides the QR itself, is what's actually still
    // collectible. Best-effort: the QR must render even if this fails.
    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            rpc<Prescription[]>("app_list_prescriptions")
                .then((d) => setPrescriptions(d ?? []))
                .catch(() => {});
        }, [user])
    );

    const copy = async () => {
        if (!user) return;
        await Clipboard.setStringAsync(user.medicalId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!user) return null;

    const active = prescriptions
        .filter((p) => ACTIVE_STATUSES.has(p.status))
        .sort((a, b) => b.dateIssued.localeCompare(a.dateIssued));

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <ScreenHeader
                    title="My Medical ID"
                    subtitle="Show this QR code at any doctor or pharmacy"
                />

                <Card style={styles.qrCard}>
                    <View style={styles.qrFrame}>
                        <QRCode
                            value={user.medicalId}
                            size={230}
                            color={colors.primaryDark}
                            backgroundColor="#FFFFFF"
                        />
                    </View>

                    <Pressable onPress={copy} style={styles.idPill}>
                        <Text style={styles.idText}>{user.medicalId}</Text>
                        <Ionicons
                            name={copied ? "checkmark" : "copy-outline"}
                            size={16}
                            color={copied ? colors.primary : colors.textMuted}
                        />
                    </Pressable>
                    {copied && <Text style={styles.copied}>Copied!</Text>}

                    <View style={styles.verified}>
                        <View style={styles.verifiedDot} />
                        <Text style={styles.verifiedText}>Verified by AyuLink</Text>
                    </View>
                </Card>

                {active.length > 0 && (
                    <>
                        <Text style={styles.miniLabel}>Ready to collect</Text>
                        <Card style={{ marginBottom: spacing.md }}>
                            {active.slice(0, 3).map((p, i) => {
                                const meta = statusMeta[p.status];
                                const remaining = p.items.filter((it) => !it.dispensed).length;
                                return (
                                    <Pressable
                                        key={p.id}
                                        onPress={() => router.push("/(tabs)/prescriptions")}
                                        style={[styles.rxRow, i > 0 && styles.rxRowBorder]}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.rxTitle} numberOfLines={1}>
                                                {p.diagnosis}
                                            </Text>
                                            <Text style={styles.rxMeta}>
                                                {remaining} of {p.items.length} item
                                                {p.items.length === 1 ? "" : "s"} remaining
                                            </Text>
                                        </View>
                                        <View style={[styles.rxPill, { backgroundColor: meta.bg }]}>
                                            <Text style={[styles.rxPillText, { color: meta.color }]}>
                                                {meta.label}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                            {active.length > 3 && (
                                <Text style={styles.rxMore}>+ {active.length - 3} more</Text>
                            )}
                        </Card>
                    </>
                )}

                <Card style={{ marginBottom: spacing.md }}>
                    <InfoRow icon="person" label="Full Name" value={`${user.firstName} ${user.lastName}`} />
                    <InfoRow icon="card" label="NIC Number" value={user.nicNumber} />
                    <InfoRow icon="qr-code" label="Medical ID" value={user.medicalId} last />
                </Card>

                <Text style={styles.sectionTitle}>How to use</Text>
                <Card style={{ marginBottom: spacing.md }}>
                    {STEPS.map((step, i) => (
                        <View
                            key={step.title}
                            style={[styles.step, i === STEPS.length - 1 && { borderBottomWidth: 0, paddingBottom: 0 }]}
                        >
                            <View style={styles.stepNum}>
                                <Text style={styles.stepNumText}>{i + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.stepTitle}>{step.title}</Text>
                                <Text style={styles.stepText}>{step.text}</Text>
                            </View>
                        </View>
                    ))}
                </Card>

                <View style={styles.notice}>
                    <Ionicons name="shield-checkmark" size={18} color={colors.primaryDark} />
                    <Text style={styles.noticeText}>
                        Your QR code contains only your Medical ID — no personal health
                        data is stored inside it.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function InfoRow({
    icon,
    label,
    value,
    last = false,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    last?: boolean;
}) {
    return (
        <View style={[styles.infoRow, last && { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <View style={styles.infoIcon}>
                <Ionicons name={icon} size={16} color={colors.primaryDark} />
            </View>
            <View>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
    qrCard: { alignItems: "center", paddingVertical: spacing.lg, marginBottom: spacing.md },
    qrFrame: {
        padding: 14,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: colors.primarySoft,
        backgroundColor: "#fff",
        marginBottom: spacing.md,
    },
    idPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.background,
        borderRadius: radius.full,
        paddingHorizontal: 16,
        paddingVertical: 9,
    },
    idText: {
        fontSize: 13.5,
        fontWeight: "700",
        color: colors.text,
        letterSpacing: 0.5,
    },
    copied: { fontSize: 11, color: colors.primaryDark, marginTop: 6, fontWeight: "700" },
    verified: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: spacing.sm,
    },
    verifiedDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    verifiedText: { fontSize: 12, color: colors.primaryDark, fontWeight: "600" },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "800",
        color: colors.text,
        marginBottom: spacing.sm,
    },
    miniLabel: { ...type.label, color: colors.textMuted, marginBottom: spacing.sm },
    rxRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
    rxRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    rxTitle: { fontSize: 13.5, fontWeight: "700", color: colors.text },
    rxMeta: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
    rxPill: { borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4 },
    rxPillText: { fontSize: 10.5, fontWeight: "700" },
    rxMore: { fontSize: 11.5, color: colors.textMuted, textAlign: "center", paddingTop: 8 },
    infoRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    infoIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
    },
    infoLabel: { fontSize: 11, color: colors.textMuted },
    infoValue: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 1 },
    step: {
        flexDirection: "row",
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingBottom: 12,
    },
    stepNum: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 2,
    },
    stepNumText: { color: "#fff", fontWeight: "800", fontSize: 12 },
    stepTitle: { fontSize: 13.5, fontWeight: "700", color: colors.text },
    stepText: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
    notice: {
        flexDirection: "row",
        gap: 10,
        backgroundColor: colors.primarySoft,
        borderRadius: radius.md,
        padding: spacing.md,
        alignItems: "center",
    },
    noticeText: {
        flex: 1,
        fontSize: 12.5,
        color: colors.primaryDark,
        lineHeight: 18,
    },
});
