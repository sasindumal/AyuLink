// ==============================================
// AyuLink Doctor - Clinical History
//
// The patient's own background, opened from the prescribing screen after
// a Medical ID scan: allergies, chronic conditions, medicines they
// already take, past surgeries, family history, implants, lifestyle and
// emergency contact.
//
// Two things this screen is careful about, because both change how a
// clinician should read it:
//
//   * Everything here is SELF-REPORTED unless a clinician confirmed it.
//     Each entry carries that badge. Treating a patient's recollection as
//     a verified record is the failure this data can cause, so the
//     provenance is never hidden.
//
//   * "Not answered" is shown as loudly as an entry. An empty allergy
//     list that nobody ever filled in is not the same as "no known
//     allergies", and a doctor must never have to guess which one they
//     are looking at.
// ==============================================

import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";

export type SectionStatus = "UNKNOWN" | "NONE" | "LISTED";

export interface ClinicalHistory {
    scope?: "FULL" | "DISPENSING";
    profile?: Record<string, any>;
    allergies?: {
        allergen: string; kind: string; reaction?: string | null;
        severity: string; source?: string;
    }[];
    conditions?: { condition: string; since?: string | null; status?: string; source?: string }[];
    medications?: { drug_name: string; dosage?: string | null; frequency?: string | null; source?: string }[];
    history?: {
        kind: string; label: string; occurred_year?: number | null;
        relationship?: string | null; source?: string;
    }[];
}

const SEVERITY_STYLE: Record<string, { bg: string; fg: string }> = {
    ANAPHYLAXIS: { bg: colors.dangerSoft, fg: colors.danger },
    SEVERE: { bg: colors.dangerSoft, fg: colors.danger },
    MODERATE: { bg: colors.warningSoft, fg: colors.warningInk },
    MILD: { bg: colors.primarySoft, fg: colors.primaryDark },
    UNKNOWN: { bg: colors.primarySoft, fg: colors.primaryDark },
};

function StatusLine({ status, noneLabel }: { status: SectionStatus; noneLabel: string }) {
    if (status === "NONE") {
        return (
            <View style={styles.noneRow}>
                <Ionicons name="checkmark-circle" size={15} color={colors.primaryDark} />
                <Text style={styles.noneText}>{noneLabel}</Text>
            </View>
        );
    }
    return (
        <View style={styles.unknownRow}>
            <Ionicons name="help-circle" size={15} color={colors.warningInk} />
            <Text style={styles.unknownText}>Not answered — ask the patient</Text>
        </View>
    );
}

function Section({
    icon, title, status, noneLabel, children,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    status: SectionStatus;
    noneLabel: string;
    children?: React.ReactNode;
}) {
    return (
        <View style={styles.section}>
            <View style={styles.sectionHead}>
                <Ionicons name={icon} size={16} color={colors.primaryDark} />
                <Text style={styles.sectionTitle}>{title}</Text>
            </View>
            {status === "LISTED" ? children : <StatusLine status={status} noneLabel={noneLabel} />}
        </View>
    );
}

function SourceBadge({ source }: { source?: string }) {
    const confirmed = source === "DOCTOR";
    return (
        <View style={[styles.badge, confirmed ? styles.badgeDoctor : styles.badgePatient]}>
            <Text style={[styles.badgeText, confirmed ? styles.badgeTextDoctor : styles.badgeTextPatient]}>
                {confirmed ? "Confirmed" : "Self-reported"}
            </Text>
        </View>
    );
}

const LIFESTYLE_LABEL: Record<string, string> = {
    NEVER: "Never", FORMER: "Gave up", CURRENT: "Yes",
    OCCASIONAL: "Sometimes", REGULAR: "Regularly", UNKNOWN: "Not answered",
};

export function ClinicalHistorySheet({
    visible, loading, error, data, patientName, onClose,
}: {
    visible: boolean;
    loading: boolean;
    error: string | null;
    data: ClinicalHistory | null;
    patientName: string;
    onClose: () => void;
}) {
    const p = data?.profile ?? {};
    const st = (k: string): SectionStatus => (p[k] as SectionStatus) ?? "UNKNOWN";
    const historyOf = (kind: string) => (data?.history ?? []).filter((h) => h.kind === kind);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <View style={styles.grabber} />
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>Clinical History</Text>
                            <Text style={styles.subtitle}>{patientName}</Text>
                        </View>
                        <Pressable onPress={onClose} hitSlop={10}>
                            <Ionicons name="close" size={22} color={colors.textMuted} />
                        </Pressable>
                    </View>

                    {loading ? (
                        <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginVertical: spacing.xl }} />
                    ) : error ? (
                        <Text style={styles.error}>{error}</Text>
                    ) : (
                        <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
                            <View style={styles.disclaimer}>
                                <Ionicons name="information-circle-outline" size={15} color={colors.warningInk} />
                                <Text style={styles.disclaimerText}>
                                    Entered by the patient unless marked Confirmed. Verify anything you
                                    intend to act on.
                                </Text>
                            </View>

                            <Section icon="warning" title="Allergies" status={st("allergies_status")}
                                noneLabel="No known allergies">
                                {(data?.allergies ?? []).map((a, i) => {
                                    const tone = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.UNKNOWN;
                                    return (
                                        <View key={i} style={[styles.entry, { backgroundColor: tone.bg }]}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.entryTitle, { color: tone.fg }]}>
                                                    {a.allergen}
                                                    {a.severity !== "UNKNOWN" ? ` · ${a.severity}` : ""}
                                                </Text>
                                                <Text style={styles.entryDetail}>
                                                    {[a.kind, a.reaction].filter(Boolean).join(" · ")}
                                                </Text>
                                            </View>
                                            <SourceBadge source={a.source} />
                                        </View>
                                    );
                                })}
                            </Section>

                            <Section icon="pulse" title="Long-term conditions" status={st("conditions_status")}
                                noneLabel="No long-term conditions reported">
                                {(data?.conditions ?? []).map((c, i) => (
                                    <View key={i} style={styles.entry}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.entryTitle}>{c.condition}</Text>
                                            {(c.since || c.status) && (
                                                <Text style={styles.entryDetail}>
                                                    {[c.status, c.since ? `since ${c.since}` : null].filter(Boolean).join(" · ")}
                                                </Text>
                                            )}
                                        </View>
                                        <SourceBadge source={c.source} />
                                    </View>
                                ))}
                            </Section>

                            <Section icon="medkit" title="Current medicines" status={st("medications_status")}
                                noneLabel="Not taking any regular medicines">
                                {(data?.medications ?? []).map((m, i) => (
                                    <View key={i} style={styles.entry}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.entryTitle}>{m.drug_name}</Text>
                                            <Text style={styles.entryDetail}>
                                                {[m.dosage, m.frequency].filter(Boolean).join(" · ")}
                                            </Text>
                                        </View>
                                        <SourceBadge source={m.source} />
                                    </View>
                                ))}
                            </Section>

                            {(p.blood_group || p.height_cm || p.weight_kg ||
                              (p.pregnancy_status && p.pregnancy_status !== "NOT_APPLICABLE")) && (
                                <View style={styles.section}>
                                    <View style={styles.sectionHead}>
                                        <Ionicons name="water" size={16} color={colors.primaryDark} />
                                        <Text style={styles.sectionTitle}>Body &amp; blood</Text>
                                    </View>
                                    <View style={styles.chipWrap}>
                                        {p.blood_group && <Chip label={`Blood ${p.blood_group}`} />}
                                        {p.height_cm && <Chip label={`${p.height_cm} cm`} />}
                                        {p.weight_kg && <Chip label={`${p.weight_kg} kg`} />}
                                        {p.pregnancy_status && p.pregnancy_status !== "NOT_APPLICABLE" &&
                                            p.pregnancy_status !== "NOT_PREGNANT" && (
                                            <Chip label={p.pregnancy_status === "PREGNANT" ? "Pregnant" : "Breastfeeding"} alert />
                                        )}
                                    </View>
                                </View>
                            )}

                            <Section icon="cut" title="Surgeries &amp; hospital stays" status={st("surgeries_status")}
                                noneLabel="None reported">
                                {[...historyOf("SURGERY"), ...historyOf("HOSPITALISATION")].map((h, i) => (
                                    <View key={i} style={styles.entry}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.entryTitle}>{h.label}</Text>
                                            {!!h.occurred_year && <Text style={styles.entryDetail}>{h.occurred_year}</Text>}
                                        </View>
                                        <SourceBadge source={h.source} />
                                    </View>
                                ))}
                            </Section>

                            <Section icon="people" title="Family history" status={st("family_history_status")}
                                noneLabel="None reported">
                                {historyOf("FAMILY_HISTORY").map((h, i) => (
                                    <View key={i} style={styles.entry}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.entryTitle}>{h.label}</Text>
                                            {!!h.relationship && <Text style={styles.entryDetail}>{h.relationship}</Text>}
                                        </View>
                                        <SourceBadge source={h.source} />
                                    </View>
                                ))}
                            </Section>

                            <Section icon="hardware-chip" title="Implants &amp; devices" status={st("implants_status")}
                                noneLabel="None reported">
                                {historyOf("IMPLANT").map((h, i) => (
                                    <View key={i} style={styles.entry}>
                                        <Text style={[styles.entryTitle, { flex: 1 }]}>{h.label}</Text>
                                        <SourceBadge source={h.source} />
                                    </View>
                                ))}
                            </Section>

                            <Section icon="shield-checkmark" title="Vaccinations" status={st("immunisations_status")}
                                noneLabel="None reported">
                                {historyOf("IMMUNISATION").map((h, i) => (
                                    <View key={i} style={styles.entry}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.entryTitle}>{h.label}</Text>
                                            {!!h.occurred_year && <Text style={styles.entryDetail}>{h.occurred_year}</Text>}
                                        </View>
                                        <SourceBadge source={h.source} />
                                    </View>
                                ))}
                            </Section>

                            {(p.smoking !== "UNKNOWN" || p.alcohol !== "UNKNOWN" || p.betel !== "UNKNOWN") && (
                                <View style={styles.section}>
                                    <View style={styles.sectionHead}>
                                        <Ionicons name="leaf" size={16} color={colors.primaryDark} />
                                        <Text style={styles.sectionTitle}>Lifestyle</Text>
                                    </View>
                                    <View style={styles.chipWrap}>
                                        {p.smoking && p.smoking !== "UNKNOWN" && <Chip label={`Smoking: ${LIFESTYLE_LABEL[p.smoking]}`} />}
                                        {p.alcohol && p.alcohol !== "UNKNOWN" && <Chip label={`Alcohol: ${LIFESTYLE_LABEL[p.alcohol]}`} />}
                                        {p.betel && p.betel !== "UNKNOWN" && <Chip label={`Betel: ${LIFESTYLE_LABEL[p.betel]}`} />}
                                    </View>
                                </View>
                            )}

                            {p.emergency_contact_phone && (
                                <View style={styles.section}>
                                    <View style={styles.sectionHead}>
                                        <Ionicons name="call" size={16} color={colors.primaryDark} />
                                        <Text style={styles.sectionTitle}>Emergency contact</Text>
                                    </View>
                                    <Text style={styles.entryTitle}>
                                        {p.emergency_contact_name}
                                        {p.emergency_contact_relationship ? ` (${p.emergency_contact_relationship})` : ""}
                                    </Text>
                                    <Text style={styles.entryDetail}>{p.emergency_contact_phone}</Text>
                                </View>
                            )}
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
}

function Chip({ label, alert = false }: { label: string; alert?: boolean }) {
    return (
        <View style={[styles.chip, alert && styles.chipAlert]}>
            <Text style={[styles.chipText, alert && styles.chipTextAlert]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(28, 43, 26, 0.45)", justifyContent: "flex-end" },
    sheet: {
        backgroundColor: colors.background,
        borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
        padding: spacing.lg, paddingTop: spacing.sm,
    },
    grabber: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
    header: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.sm },
    title: { fontSize: 17, fontWeight: "800", color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    error: { color: colors.danger, fontSize: 13.5, paddingVertical: spacing.lg, textAlign: "center" },
    disclaimer: {
        flexDirection: "row", alignItems: "flex-start", gap: 7,
        backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: 10, marginBottom: spacing.sm,
    },
    disclaimerText: { flex: 1, fontSize: 12, color: colors.warningInk, lineHeight: 17 },
    section: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: 8 },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
    sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
    entry: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: 10, marginBottom: 6 },
    entryTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
    entryDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    noneRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    noneText: { fontSize: 13, color: colors.primaryDark, fontWeight: "600" },
    unknownRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    unknownText: { fontSize: 13, color: colors.warningInk, fontWeight: "700" },
    badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm },
    badgePatient: { backgroundColor: colors.warningSoft },
    badgeDoctor: { backgroundColor: colors.primarySoft },
    badgeText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3 },
    badgeTextPatient: { color: colors.warningInk },
    badgeTextDoctor: { color: colors.primaryDark },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
    chipAlert: { backgroundColor: colors.dangerSoft },
    chipText: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
    chipTextAlert: { color: colors.danger },
});
