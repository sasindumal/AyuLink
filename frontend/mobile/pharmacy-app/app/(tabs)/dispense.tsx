// ==============================================
// AyuLink Pharmacy - Scan & Dispense
// Patient lookup + per-item dispensing with a
// 15-minute undo window
// ==============================================

import React, { useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, shadow, spacing } from "../../src/theme";
import {
    Banner,
    Button,
    Card,
    Input,
    ScreenHeader,
    StatusBadge,
    formatTime,
} from "../../src/components/ui";
import { QRScannerModal } from "../../src/components/QRScannerModal";
import type { PatientLookup, Prescription } from "../../src/types";

const REVERT_WINDOW_MS = 15 * 60 * 1000;

function RxDispenseCard({
    rx,
    busyItem,
    canUndo,
    onToggle,
}: {
    rx: Prescription;
    busyItem: string | null;
    canUndo: (item: Prescription["items"][number]) => boolean;
    onToggle: (prescriptionId: string, itemId: string, dispensed: boolean) => void;
}) {
    const dispensedCount = rx.items.filter((i) => i.dispensed).length;
    const progress = rx.items.length === 0 ? 0 : dispensedCount / rx.items.length;

    return (
        <View style={styles.rxCard}>
            <View style={styles.rxHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.rxDiagnosis}>{rx.diagnosis}</Text>
                    <Text style={styles.rxMeta}>
                        {rx.doctor ? `Dr. ${rx.doctor.firstName} ${rx.doctor.lastName}` : ""}
                        {rx.doctor?.doctorProfile ? ` · ${rx.doctor.doctorProfile.specialization}` : ""}
                    </Text>
                    {(rx.patientAge != null || rx.patientWeightKg != null) && (
                        <Text style={styles.rxMeta}>
                            {[
                                rx.patientAge != null ? `Age ${rx.patientAge}` : null,
                                rx.patientWeightKg != null ? `${rx.patientWeightKg} kg` : null,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </Text>
                    )}
                </View>
                <StatusBadge status={rx.status} />
            </View>

            <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>
                {dispensedCount}/{rx.items.length} dispensed
            </Text>

            {rx.items.map((item) => (
                <View key={item.id} style={styles.item}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                        <View style={styles.itemNameRow}>
                            <View
                                style={[
                                    styles.dot,
                                    { backgroundColor: item.dispensed ? colors.primary : colors.warning },
                                ]}
                            />
                            <Text style={styles.itemName}>{item.drugName}</Text>
                        </View>
                        <Text style={styles.itemDetail}>
                            {item.route ? `${item.route} · ` : ""}
                            {item.dosage} · {item.frequency} · {item.duration}
                        </Text>
                        {!!item.instructions && (
                            <Text style={styles.itemInstructions}>{item.instructions}</Text>
                        )}
                        {item.dispensed && item.dispensedAt && (
                            <Text style={styles.itemDone}>Done at {formatTime(item.dispensedAt)}</Text>
                        )}
                    </View>

                    {busyItem === item.id ? (
                        <ActivityIndicator color={colors.primaryDark} />
                    ) : item.dispensed ? (
                        canUndo(item) ? (
                            <Pressable onPress={() => onToggle(rx.id, item.id, false)} style={styles.undoBtn}>
                                <Ionicons name="arrow-undo" size={14} color={colors.danger} />
                                <Text style={styles.undoText}>Undo</Text>
                            </Pressable>
                        ) : (
                            <Ionicons name="checkmark-circle" size={26} color={colors.primary} />
                        )
                    ) : (
                        <Pressable onPress={() => onToggle(rx.id, item.id, true)} style={styles.dispenseBtn}>
                            <Text style={styles.dispenseText}>Dispense</Text>
                        </Pressable>
                    )}
                </View>
            ))}
        </View>
    );
}

export default function Dispense() {
    const { user } = useAuth();
    const [scannerOpen, setScannerOpen] = useState(false);
    const [manualId, setManualId] = useState("");
    const [lookupLoading, setLookupLoading] = useState(false);
    const [patient, setPatient] = useState<PatientLookup | null>(null);
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [singleRx, setSingleRx] = useState<Prescription | null>(null);
    const [busyItem, setBusyItem] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const lookup = async (medicalId: string) => {
        setScannerOpen(false);
        if (!medicalId.trim()) return;
        setError(null);
        setSingleRx(null);
        setLookupLoading(true);
        try {
            const data = await rpc<PatientLookup>("app_lookup_patient", {
                p_medical_id: medicalId.trim(),
            });
            setPatient(data);
            setPrescriptions(data.prescriptionsAsPatient ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Patient not found");
        } finally {
            setLookupLoading(false);
        }
    };

    // A patient's per-prescription QR encodes the prescription's own
    // id, not their Medical ID — scanning one shows only that single
    // prescription (never their other pending ones), and a fully
    // dispensed prescription's QR is refused by the RPC outright.
    const lookupPrescription = async (prescriptionId: string) => {
        setError(null);
        setPatient(null);
        setPrescriptions([]);
        setLookupLoading(true);
        try {
            const data = await rpc<Prescription>("app_lookup_prescription_by_id", {
                p_prescription_id: prescriptionId,
            });
            setSingleRx(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Prescription not found");
        } finally {
            setLookupLoading(false);
        }
    };

    const handleScan = (data: string) => {
        setScannerOpen(false);
        const trimmed = data.trim();
        if (!trimmed) return;
        if (trimmed.toUpperCase().startsWith("AYU-")) {
            lookup(trimmed);
        } else {
            lookupPrescription(trimmed);
        }
    };

    const toggleItem = async (
        prescriptionId: string,
        itemId: string,
        dispensed: boolean
    ) => {
        setBusyItem(itemId);
        setError(null);
        try {
            const data = await rpc<{ prescription: Prescription }>(
                "app_dispense_item",
                {
                    p_prescription_id: prescriptionId,
                    p_item_id: itemId,
                    p_dispensed: dispensed,
                }
            );
            setPrescriptions((list) =>
                list.map((p) => (p.id === prescriptionId ? data.prescription : p))
            );
            setSingleRx((rx) => (rx && rx.id === prescriptionId ? data.prescription : rx));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to update item");
        } finally {
            setBusyItem(null);
        }
    };

    const canUndo = (item: Prescription["items"][number]): boolean =>
        item.dispensed &&
        item.dispensedById === user?.id &&
        !!item.dispensedAt &&
        Date.now() - new Date(item.dispensedAt).getTime() < REVERT_WINDOW_MS;

    const activeRx = prescriptions.filter(
        (p) => p.status !== "FULLY_DISPENSED" && p.status !== "EXPIRED"
    );
    const reset = () => {
        setPatient(null);
        setPrescriptions([]);
        setSingleRx(null);
        setManualId("");
        setError(null);
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
            >
                <ScreenHeader
                    title="Scan & Dispense"
                    subtitle="Scan a Medical ID or a single prescription QR"
                />

                {error && <Banner kind="error" message={error} />}

                {singleRx ? (
                    <>
                        <Card style={styles.patientCard}>
                            <View style={styles.patientAvatar}>
                                <Ionicons name="person" size={22} color="#fff" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.patientName}>
                                    {singleRx.patient?.firstName} {singleRx.patient?.lastName}
                                </Text>
                                <Text style={styles.patientMeta}>
                                    NIC {singleRx.patient?.nicNumber} · {singleRx.patient?.medicalId}
                                </Text>
                            </View>
                            <Pressable onPress={reset} style={styles.changeBtn}>
                                <Text style={styles.changeBtnText}>New Search</Text>
                            </Pressable>
                        </Card>

                        <Text style={styles.sectionTitle}>This Prescription</Text>
                        <Text style={styles.singleRxHint}>
                            Scanned from the patient's prescription QR — their other
                            prescriptions are not shown.
                        </Text>

                        <RxDispenseCard rx={singleRx} busyItem={busyItem} canUndo={canUndo} onToggle={toggleItem} />
                    </>
                ) : !patient ? (
                    <Card>
                        <Button
                            title="Scan Patient QR Code"
                            icon="scan"
                            onPress={() => setScannerOpen(true)}
                        />
                        <View style={styles.divider}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>or enter manually</Text>
                            <View style={styles.dividerLine} />
                        </View>
                        <Input
                            placeholder="Medical ID (e.g. AYU-200012345678)"
                            value={manualId}
                            onChangeText={setManualId}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            onSubmitEditing={() => lookup(manualId)}
                        />
                        <Button
                            title="Look Up Patient"
                            variant="secondary"
                            loading={lookupLoading}
                            onPress={() => lookup(manualId)}
                        />
                    </Card>
                ) : (
                    <>
                        <Card style={styles.patientCard}>
                            <View style={styles.patientAvatar}>
                                <Ionicons name="person" size={22} color="#fff" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.patientName}>
                                    {patient.firstName} {patient.lastName}
                                </Text>
                                <Text style={styles.patientMeta}>
                                    NIC {patient.nicNumber} · {patient.medicalId}
                                </Text>
                            </View>
                            <Pressable onPress={reset} style={styles.changeBtn}>
                                <Text style={styles.changeBtnText}>New Search</Text>
                            </Pressable>
                        </Card>

                        <Text style={styles.sectionTitle}>
                            Active Prescriptions ({activeRx.length})
                        </Text>

                        {activeRx.length === 0 && (
                            <Card style={{ alignItems: "center", paddingVertical: spacing.lg }}>
                                <Ionicons
                                    name="checkmark-done-circle"
                                    size={40}
                                    color={colors.primary}
                                />
                                <Text style={styles.allDone}>
                                    No active prescriptions — everything has been
                                    dispensed.
                                </Text>
                            </Card>
                        )}

                        {activeRx.map((rx) => (
                            <RxDispenseCard key={rx.id} rx={rx} busyItem={busyItem} canUndo={canUndo} onToggle={toggleItem} />
                        ))}
                    </>
                )}
            </ScrollView>

            <QRScannerModal
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScanned={handleScan}
                title="Scan Patient QR Code"
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
    divider: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginVertical: spacing.md,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { fontSize: 12, color: colors.textMuted },
    patientCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: spacing.md,
        backgroundColor: colors.primarySoft,
    },
    patientAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
    },
    patientName: { fontSize: 15, fontWeight: "800", color: colors.text },
    patientMeta: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
    changeBtn: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radius.full,
        backgroundColor: colors.surface,
    },
    changeBtnText: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
    singleRxHint: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: -4,
        marginBottom: spacing.sm,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: "800",
        color: colors.text,
        marginBottom: spacing.sm,
    },
    allDone: {
        fontSize: 13,
        color: colors.textMuted,
        textAlign: "center",
        marginTop: 8,
    },
    rxCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        marginBottom: 12,
        ...shadow.card,
    },
    rxHeader: { flexDirection: "row", alignItems: "flex-start" },
    rxDiagnosis: { fontSize: 15, fontWeight: "800", color: colors.text },
    rxMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    progressTrack: {
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.neutralSoft,
        marginTop: 10,
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        borderRadius: 3,
        backgroundColor: colors.primary,
    },
    progressText: {
        fontSize: 11,
        color: colors.textMuted,
        marginTop: 4,
        marginBottom: 6,
    },
    item: {
        flexDirection: "row",
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingVertical: 10,
    },
    itemNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    itemName: {
        fontSize: 13.5,
        fontWeight: "700",
        color: colors.text,
        flexShrink: 1,
    },
    itemDetail: { fontSize: 12, color: colors.textMuted, marginLeft: 16, marginTop: 2 },
    itemInstructions: {
        fontSize: 11.5,
        color: colors.textMuted,
        fontStyle: "italic",
        marginLeft: 16,
        marginTop: 2,
    },
    itemDone: {
        fontSize: 11,
        color: colors.primaryDark,
        fontWeight: "700",
        marginLeft: 16,
        marginTop: 3,
    },
    dispenseBtn: {
        // primaryDark, not primary — white text on #48A111 fails AA (3.29:1).
        backgroundColor: colors.primaryDark,
        borderRadius: radius.full,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    dispenseText: { color: "#fff", fontSize: 12, fontWeight: "800" },
    undoBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: colors.dangerSoft,
        borderRadius: radius.full,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    undoText: { color: colors.danger, fontSize: 12, fontWeight: "800" },
});
