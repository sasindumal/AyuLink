// ==============================================
// AyuLink Patient - Health Profile
//
// The background a doctor reads after scanning your Medical ID:
// allergies, chronic conditions, regular medications, past surgeries,
// family history, plus lifestyle and emergency contact.
//
// Every list section is a THREE-state control, not a list that happens
// to be empty: "Not answered", "I have none", or entries. That is the
// whole point of the screen — a doctor seeing an empty allergy list must
// be able to tell "the patient told us they have none" apart from
// "nobody ever asked", and only the patient can close that gap.
// ==============================================

import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../src/theme";
import { Banner, Button, Input, FilterChips } from "../src/components/ui";
import { SelectField } from "../src/components/SelectField";
import {
    ALLERGY_KINDS,
    BLOOD_GROUPS,
    HISTORY_KIND_LABEL,
    SEVERITIES,
    completeness,
    getMyHealthProfile,
    saveMyHealthProfile,
    type Allergy,
    type Condition,
    type HealthProfile,
    type HistoryEvent,
    type HistoryKind,
    type Medication,
    type SectionStatus,
} from "../src/lib/healthProfile";

const STATUS_OPTIONS: { key: SectionStatus; label: string }[] = [
    { key: "UNKNOWN", label: "Not answered" },
    { key: "NONE", label: "I have none" },
    { key: "LISTED", label: "I'll list them" },
];

function SectionShell({
    icon,
    title,
    hint,
    status,
    onStatus,
    children,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    hint?: string;
    status: SectionStatus;
    onStatus: (s: SectionStatus) => void;
    children?: React.ReactNode;
}) {
    return (
        <View style={styles.section}>
            <View style={styles.sectionHead}>
                <Ionicons name={icon} size={17} color={colors.primaryDark} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>{title}</Text>
                    {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
                </View>
                {status === "UNKNOWN" && (
                    <View style={styles.unknownPill}>
                        <Text style={styles.unknownPillText}>Not answered</Text>
                    </View>
                )}
            </View>
            <FilterChips<SectionStatus> value={status} onChange={onStatus} options={STATUS_OPTIONS} />
            {status === "LISTED" && <View style={{ marginTop: spacing.sm }}>{children}</View>}
        </View>
    );
}

function EntryRow({ title, detail, onRemove }: { title: string; detail?: string; onRemove: () => void }) {
    return (
        <View style={styles.entry}>
            <View style={{ flex: 1 }}>
                <Text style={styles.entryTitle}>{title}</Text>
                {!!detail && <Text style={styles.entryDetail}>{detail}</Text>}
            </View>
            <Pressable onPress={onRemove} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.danger} />
            </Pressable>
        </View>
    );
}

export default function HealthProfileScreen() {
    const [data, setData] = useState<HealthProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Working copy — nothing reaches the database until Save.
    const [core, setCore] = useState<Record<string, any>>({});
    const [allergies, setAllergies] = useState<Allergy[]>([]);
    const [conditions, setConditions] = useState<Condition[]>([]);
    const [medications, setMedications] = useState<Medication[]>([]);
    const [history, setHistory] = useState<HistoryEvent[]>([]);

    // Draft rows for the "add" forms.
    const [newAllergy, setNewAllergy] = useState<Allergy>({ allergen: "", kind: "DRUG", severity: "UNKNOWN" });
    const [newCondition, setNewCondition] = useState("");
    const [newMed, setNewMed] = useState<Medication>({ drugName: "", dosage: "", frequency: "" });
    const [newHistory, setNewHistory] = useState<{ kind: HistoryKind; label: string; year: string; relationship: string }>(
        { kind: "SURGERY", label: "", year: "", relationship: "" }
    );

    const load = useCallback(async () => {
        try {
            const p = await getMyHealthProfile();
            setData(p);
            setCore({ ...p.profile });
            setAllergies(p.allergies ?? []);
            setConditions(p.conditions ?? []);
            setMedications(p.medications ?? []);
            setHistory(p.history ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't load your health profile");
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const status = (k: string): SectionStatus => (core[k] as SectionStatus) ?? "UNKNOWN";
    const setStatus = (k: string) => (v: SectionStatus) => setCore((c) => ({ ...c, [k]: v }));
    const setField = (k: string) => (v: any) => setCore((c) => ({ ...c, [k]: v }));

    // Pregnancy only applies to female patients — same gate Ayu uses.
    const isFemale = data?.gender === "FEMALE";

    const progress = useMemo(
        () => (data ? completeness({ ...data, profile: core as any }) : { answered: 0, total: 9 }),
        [data, core]
    );

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const updated = await saveMyHealthProfile({
                profile: {
                    bloodGroup: core.blood_group || undefined,
                    heightCm: core.height_cm ?? undefined,
                    weightKg: core.weight_kg ?? undefined,
                    pregnancyStatus: isFemale ? core.pregnancy_status || undefined : undefined,
                    smoking: core.smoking || undefined,
                    alcohol: core.alcohol || undefined,
                    betel: core.betel || undefined,
                    disabilities: core.disabilities ?? undefined,
                    emergencyContactName: core.emergency_contact_name ?? undefined,
                    emergencyContactRelationship: core.emergency_contact_relationship ?? undefined,
                    emergencyContactPhone: core.emergency_contact_phone ?? undefined,
                    allergiesStatus: status("allergies_status"),
                    conditionsStatus: status("conditions_status"),
                    medicationsStatus: status("medications_status"),
                    surgeriesStatus: status("surgeries_status"),
                    familyHistoryStatus: status("family_history_status"),
                    immunisationsStatus: status("immunisations_status"),
                    implantsStatus: status("implants_status"),
                    profileCompletedAt: new Date().toISOString(),
                },
                // An explicit "I have none" must clear whatever was listed
                // before, or the doctor would see contradictory data.
                allergies: status("allergies_status") === "LISTED" ? allergies : [],
                conditions: status("conditions_status") === "LISTED" ? conditions : [],
                medications: status("medications_status") === "LISTED" ? medications : [],
                history: history.filter((h) => {
                    const key = h.kind === "FAMILY_HISTORY" ? "family_history_status"
                        : h.kind === "IMMUNISATION" ? "immunisations_status"
                        : h.kind === "IMPLANT" ? "implants_status" : "surgeries_status";
                    return status(key) === "LISTED";
                }),
            });
            setData(updated);
            setNotice("Saved. Your doctor will see this when they scan your Medical ID.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't save");
        } finally {
            setSaving(false);
        }
    };

    const historyOf = (kind: HistoryKind) => history.filter((h) => h.kind === kind);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={6}>
                    <Ionicons name="arrow-back" size={22} color={colors.primaryDark} />
                </Pressable>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Health Profile</Text>
                    <Text style={styles.headerSubtitle}>
                        {progress.answered} of {progress.total} answered
                    </Text>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
            ) : (
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                    {error && <Banner kind="error" message={error} />}
                    {notice && <Banner kind="info" message={notice} />}

                    <Text style={styles.intro}>
                        Doctors see this the moment they scan your Medical ID. Telling us you have
                        none of something is just as useful as listing them — an empty answer only
                        tells a doctor that nobody asked.
                    </Text>

                    {/* ---------------- Tier 1 ---------------- */}
                    <Text style={styles.tier}>Essential</Text>

                    <SectionShell
                        icon="warning" title="Allergies"
                        hint="Medicines, foods, anything else"
                        status={status("allergies_status")} onStatus={setStatus("allergies_status")}
                    >
                        {allergies.map((a, i) => (
                            <EntryRow key={`${a.allergen}-${i}`}
                                title={a.allergen}
                                detail={[a.kind, a.severity !== "UNKNOWN" ? a.severity : null, a.reaction]
                                    .filter(Boolean).join(" · ")}
                                onRemove={() => setAllergies((l) => l.filter((_, x) => x !== i))} />
                        ))}
                        <Input label="Allergic to" placeholder="e.g. Penicillin"
                            value={newAllergy.allergen}
                            onChangeText={(v) => setNewAllergy((a) => ({ ...a, allergen: v }))} />
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <View style={{ flex: 1 }}>
                                <SelectField label="Type" value={newAllergy.kind} options={ALLERGY_KINDS as string[]}
                                    onChange={(v) => setNewAllergy((a) => ({ ...a, kind: (v || "DRUG") as any }))} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <SelectField label="Severity" value={newAllergy.severity} options={SEVERITIES as string[]}
                                    onChange={(v) => setNewAllergy((a) => ({ ...a, severity: (v || "UNKNOWN") as any }))} />
                            </View>
                        </View>
                        <Input label="What happens" placeholder="e.g. Rash, swelling"
                            value={newAllergy.reaction ?? ""}
                            onChangeText={(v) => setNewAllergy((a) => ({ ...a, reaction: v }))} />
                        <Button title="Add allergy" variant="secondary" icon="add"
                            disabled={!newAllergy.allergen.trim()}
                            onPress={() => {
                                setAllergies((l) => [...l, { ...newAllergy, allergen: newAllergy.allergen.trim() }]);
                                setNewAllergy({ allergen: "", kind: "DRUG", severity: "UNKNOWN" });
                            }} />
                    </SectionShell>

                    <SectionShell
                        icon="pulse" title="Long-term conditions"
                        hint="Diabetes, asthma, blood pressure…"
                        status={status("conditions_status")} onStatus={setStatus("conditions_status")}
                    >
                        {conditions.map((c, i) => (
                            <EntryRow key={`${c.condition}-${i}`} title={c.condition}
                                detail={c.since ? `since ${c.since}` : undefined}
                                onRemove={() => setConditions((l) => l.filter((_, x) => x !== i))} />
                        ))}
                        <Input label="Condition" placeholder="e.g. Type 2 Diabetes"
                            value={newCondition} onChangeText={setNewCondition} />
                        <Button title="Add condition" variant="secondary" icon="add"
                            disabled={!newCondition.trim()}
                            onPress={() => {
                                setConditions((l) => [...l, { condition: newCondition.trim(), status: "ACTIVE" }]);
                                setNewCondition("");
                            }} />
                    </SectionShell>

                    <SectionShell
                        icon="medkit" title="Medicines you take regularly"
                        hint="Including ones prescribed elsewhere"
                        status={status("medications_status")} onStatus={setStatus("medications_status")}
                    >
                        {medications.map((m, i) => (
                            <EntryRow key={`${m.drugName ?? m.drug_name}-${i}`}
                                title={m.drugName ?? m.drug_name ?? ""}
                                detail={[m.dosage, m.frequency].filter(Boolean).join(" · ")}
                                onRemove={() => setMedications((l) => l.filter((_, x) => x !== i))} />
                        ))}
                        <Input label="Medicine" placeholder="e.g. Metformin"
                            value={newMed.drugName ?? ""}
                            onChangeText={(v) => setNewMed((m) => ({ ...m, drugName: v }))} />
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <View style={{ flex: 1 }}>
                                <Input label="Dose" placeholder="500mg" value={newMed.dosage ?? ""}
                                    onChangeText={(v) => setNewMed((m) => ({ ...m, dosage: v }))} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Input label="How often" placeholder="1-0-1" value={newMed.frequency ?? ""}
                                    onChangeText={(v) => setNewMed((m) => ({ ...m, frequency: v }))} />
                            </View>
                        </View>
                        <Button title="Add medicine" variant="secondary" icon="add"
                            disabled={!(newMed.drugName ?? "").trim()}
                            onPress={() => {
                                setMedications((l) => [...l, { ...newMed, drugName: (newMed.drugName ?? "").trim(), ongoing: true }]);
                                setNewMed({ drugName: "", dosage: "", frequency: "" });
                            }} />
                    </SectionShell>

                    <View style={styles.section}>
                        <View style={styles.sectionHead}>
                            <Ionicons name="water" size={17} color={colors.primaryDark} />
                            <Text style={styles.sectionTitle}>Body & blood</Text>
                        </View>
                        <SelectField label="Blood group" placeholder="Not known"
                            value={core.blood_group ?? ""} options={BLOOD_GROUPS}
                            onChange={setField("blood_group")} />
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <View style={{ flex: 1 }}>
                                <Input label="Height (cm)" keyboardType="numeric"
                                    value={core.height_cm != null ? String(core.height_cm) : ""}
                                    onChangeText={(v) => setField("height_cm")(v ? Number(v) : null)} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Input label="Weight (kg)" keyboardType="numeric"
                                    value={core.weight_kg != null ? String(core.weight_kg) : ""}
                                    onChangeText={(v) => setField("weight_kg")(v ? Number(v) : null)} />
                            </View>
                        </View>
                        {isFemale && (
                            <>
                                <Text style={styles.fieldLabel}>Pregnancy</Text>
                                <FilterChips<string> value={core.pregnancy_status ?? ""}
                                    onChange={setField("pregnancy_status")}
                                    options={[
                                        { key: "NOT_PREGNANT", label: "No" },
                                        { key: "PREGNANT", label: "Pregnant" },
                                        { key: "BREASTFEEDING", label: "Breastfeeding" },
                                    ]} />
                            </>
                        )}
                    </View>

                    {/* ---------------- Tier 2 ---------------- */}
                    <Text style={styles.tier}>Background</Text>

                    <SectionShell icon="cut" title="Past surgeries & hospital stays"
                        status={status("surgeries_status")} onStatus={setStatus("surgeries_status")}>
                        {[...historyOf("SURGERY"), ...historyOf("HOSPITALISATION")].map((h, i) => (
                            <EntryRow key={`${h.label}-${i}`} title={h.label}
                                detail={[HISTORY_KIND_LABEL[h.kind], h.occurredYear ?? h.occurred_year].filter(Boolean).join(" · ")}
                                onRemove={() => setHistory((l) => l.filter((x) => x !== h))} />
                        ))}
                        <AddHistory kinds={["SURGERY", "HOSPITALISATION"]} draft={newHistory}
                            setDraft={setNewHistory} onAdd={(h) => setHistory((l) => [...l, h])} />
                    </SectionShell>

                    <SectionShell icon="people" title="Family history"
                        hint="Conditions in parents or siblings"
                        status={status("family_history_status")} onStatus={setStatus("family_history_status")}>
                        {historyOf("FAMILY_HISTORY").map((h, i) => (
                            <EntryRow key={`${h.label}-${i}`} title={h.label} detail={h.relationship ?? undefined}
                                onRemove={() => setHistory((l) => l.filter((x) => x !== h))} />
                        ))}
                        <AddHistory kinds={["FAMILY_HISTORY"]} draft={newHistory} setDraft={setNewHistory}
                            withRelationship onAdd={(h) => setHistory((l) => [...l, h])} />
                    </SectionShell>

                    <SectionShell icon="shield-checkmark" title="Vaccinations"
                        status={status("immunisations_status")} onStatus={setStatus("immunisations_status")}>
                        {historyOf("IMMUNISATION").map((h, i) => (
                            <EntryRow key={`${h.label}-${i}`} title={h.label}
                                detail={String(h.occurredYear ?? h.occurred_year ?? "")}
                                onRemove={() => setHistory((l) => l.filter((x) => x !== h))} />
                        ))}
                        <AddHistory kinds={["IMMUNISATION"]} draft={newHistory} setDraft={setNewHistory}
                            onAdd={(h) => setHistory((l) => [...l, h])} />
                    </SectionShell>

                    <SectionShell icon="hardware-chip" title="Implants & devices"
                        hint="Pacemaker, stent, metal implant"
                        status={status("implants_status")} onStatus={setStatus("implants_status")}>
                        {historyOf("IMPLANT").map((h, i) => (
                            <EntryRow key={`${h.label}-${i}`} title={h.label}
                                onRemove={() => setHistory((l) => l.filter((x) => x !== h))} />
                        ))}
                        <AddHistory kinds={["IMPLANT"]} draft={newHistory} setDraft={setNewHistory}
                            onAdd={(h) => setHistory((l) => [...l, h])} />
                    </SectionShell>

                    <View style={styles.section}>
                        <View style={styles.sectionHead}>
                            <Ionicons name="leaf" size={17} color={colors.primaryDark} />
                            <Text style={styles.sectionTitle}>Lifestyle</Text>
                        </View>
                        <Text style={styles.fieldLabel}>Smoking</Text>
                        <FilterChips<string> value={core.smoking ?? "UNKNOWN"} onChange={setField("smoking")}
                            options={[{ key: "UNKNOWN", label: "—" }, { key: "NEVER", label: "Never" },
                                      { key: "FORMER", label: "Gave up" }, { key: "CURRENT", label: "Yes" }]} />
                        <Text style={styles.fieldLabel}>Alcohol</Text>
                        <FilterChips<string> value={core.alcohol ?? "UNKNOWN"} onChange={setField("alcohol")}
                            options={[{ key: "UNKNOWN", label: "—" }, { key: "NEVER", label: "Never" },
                                      { key: "OCCASIONAL", label: "Sometimes" }, { key: "REGULAR", label: "Regularly" }]} />
                        {/* Betel/areca gets its own question rather than an
                            "other habits" box: it is a leading oral-cancer risk
                            factor in Sri Lanka and a doctor here will ask. */}
                        <Text style={styles.fieldLabel}>Betel</Text>
                        <FilterChips<string> value={core.betel ?? "UNKNOWN"} onChange={setField("betel")}
                            options={[{ key: "UNKNOWN", label: "—" }, { key: "NEVER", label: "Never" },
                                      { key: "OCCASIONAL", label: "Sometimes" }, { key: "REGULAR", label: "Regularly" }]} />
                    </View>

                    {/* ---------------- Tier 3 ---------------- */}
                    <Text style={styles.tier}>In an emergency</Text>
                    <View style={styles.section}>
                        <Input label="Contact name" value={core.emergency_contact_name ?? ""}
                            onChangeText={setField("emergency_contact_name")} />
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <View style={{ flex: 1 }}>
                                <Input label="Relationship" placeholder="Brother"
                                    value={core.emergency_contact_relationship ?? ""}
                                    onChangeText={setField("emergency_contact_relationship")} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Input label="Phone" keyboardType="phone-pad"
                                    value={core.emergency_contact_phone ?? ""}
                                    onChangeText={setField("emergency_contact_phone")} />
                            </View>
                        </View>
                    </View>

                    <Button title="Save health profile" onPress={save} loading={saving}
                        style={{ marginTop: spacing.md }} />
                    <View style={{ height: spacing.xl }} />
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

function AddHistory({
    kinds, draft, setDraft, withRelationship = false, onAdd,
}: {
    kinds: HistoryKind[];
    draft: { kind: HistoryKind; label: string; year: string; relationship: string };
    setDraft: (d: { kind: HistoryKind; label: string; year: string; relationship: string }) => void;
    withRelationship?: boolean;
    onAdd: (h: HistoryEvent) => void;
}) {
    const [local, setLocal] = useState({ label: "", year: "", relationship: "" });
    return (
        <>
            <Input label={HISTORY_KIND_LABEL[kinds[0]]} placeholder="e.g. Appendectomy"
                value={local.label} onChangeText={(v) => setLocal((l) => ({ ...l, label: v }))} />
            <View style={{ flexDirection: "row", gap: 10 }}>
                {withRelationship && (
                    <View style={{ flex: 1 }}>
                        <Input label="Who" placeholder="Mother" value={local.relationship}
                            onChangeText={(v) => setLocal((l) => ({ ...l, relationship: v }))} />
                    </View>
                )}
                <View style={{ flex: 1 }}>
                    <Input label="Year" placeholder="2015" keyboardType="numeric" value={local.year}
                        onChangeText={(v) => setLocal((l) => ({ ...l, year: v }))} />
                </View>
            </View>
            <Button title="Add" variant="secondary" icon="add" disabled={!local.label.trim()}
                onPress={() => {
                    onAdd({
                        kind: kinds[0],
                        label: local.label.trim(),
                        occurredYear: local.year ? Number(local.year) : null,
                        relationship: local.relationship || null,
                    });
                    setLocal({ label: "", year: "", relationship: "" });
                }} />
        </>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    backBtn: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 20, fontWeight: "800", color: colors.text },
    headerSubtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
    scroll: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xl },
    intro: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.md },
    tier: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm },
    section: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
    sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
    sectionHint: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    unknownPill: { backgroundColor: colors.warningSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
    unknownPillText: { fontSize: 10.5, fontWeight: "700", color: colors.warningInk },
    fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6, marginTop: 4 },
    entry: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: 11, marginBottom: 8 },
    entryTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
    entryDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
