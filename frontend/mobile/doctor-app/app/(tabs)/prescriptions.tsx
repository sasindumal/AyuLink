// ==============================================
// AyuLink Doctor - Issued Prescriptions
// Always sorted by most recent. Search matches patient,
// medical ID, or diagnosis; an optional date filter narrows
// to one issue date. "Look up by patient" (scan or type a
// Medical ID) restricts the list to one patient, which can
// then itself be searched/filtered by date or diagnosis.
// ==============================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, spacing } from "../../src/theme";
import {
    Banner,
    Button,
    Card,
    EmptyState,
    Input,
    ScreenHeader,
} from "../../src/components/ui";
import { PrescriptionCard } from "../../src/components/PrescriptionCard";
import { QRScannerModal } from "../../src/components/QRScannerModal";
import { ConfirmModal } from "../../src/components/ConfirmModal";
import type { Prescription } from "../../src/types";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function canModify(p: Prescription): boolean {
    const withinWindow = Date.now() - new Date(p.dateIssued).getTime() < EDIT_WINDOW_MS;
    // status is the server-derived value (prescription_json()) — anything
    // other than NOT_DISPENSED means partially/fully dispensed or expired.
    return withinWindow && p.status === "NOT_DISPENSED";
}

export default function Prescriptions() {
    const { user } = useAuth();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [search, setSearch] = useState("");
    const [dateFilter, setDateFilter] = useState("");
    const [patientFilter, setPatientFilter] = useState<string | null>(null);
    const [patientIdInput, setPatientIdInput] = useState("");
    const [scannerOpen, setScannerOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Prescription | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await rpc<Prescription[]>("app_list_prescriptions");
            setPrescriptions(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load prescriptions");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (user) load();
    }, [user, load]);

    const startEdit = (p: Prescription) => {
        router.push({
            pathname: "/(tabs)/scan",
            params: { editId: p.id, editPayload: JSON.stringify(p) },
        });
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        const target = deleteTarget;
        setDeleteTarget(null);
        setDeletingId(target.id);
        setError(null);
        try {
            await rpc("app_delete_prescription", { p_prescription_id: target.id });
            setPrescriptions((list) => list.filter((p) => p.id !== target.id));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete prescription");
        } finally {
            setDeletingId(null);
        }
    };

    const applyPatientFilter = (medicalId: string) => {
        setScannerOpen(false);
        if (!medicalId.trim()) return;
        setPatientFilter(medicalId.trim());
        setPatientIdInput("");
    };

    const matchedPatientName = useMemo(() => {
        if (!patientFilter) return null;
        const match = prescriptions.find(
            (p) => (p.patient?.medicalId ?? "").toLowerCase() === patientFilter.toLowerCase()
        );
        return match?.patient ? `${match.patient.firstName} ${match.patient.lastName}` : null;
    }, [prescriptions, patientFilter]);

    const filtered = useMemo(() => {
        let list = prescriptions;
        if (patientFilter) {
            const pf = patientFilter.toLowerCase();
            list = list.filter((p) => (p.patient?.medicalId ?? "").toLowerCase() === pf);
        }
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter(
                (p) =>
                    p.diagnosis.toLowerCase().includes(q) ||
                    `${p.patient?.firstName ?? ""} ${p.patient?.lastName ?? ""}`
                        .toLowerCase()
                        .includes(q) ||
                    (p.patient?.medicalId ?? "").toLowerCase().includes(q)
            );
        }
        const d = dateFilter.trim();
        if (d) {
            list = list.filter((p) => p.dateIssued.slice(0, 10) === d);
        }
        return [...list].sort((a, b) => b.dateIssued.localeCompare(a.dateIssued));
    }, [prescriptions, patientFilter, search, dateFilter]);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <View style={styles.container}>
                <ScreenHeader
                    title="Issued Prescriptions"
                    subtitle="Everything you have prescribed, most recent first"
                />

                {error && <Banner kind="error" message={error} />}

                <View style={styles.searchBox}>
                    <Ionicons name="search" size={17} color={colors.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by patient, medical ID, or diagnosis"
                        placeholderTextColor={colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>

                <View style={styles.dateBox}>
                    <Ionicons name="calendar-outline" size={17} color={colors.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Filter by date issued (YYYY-MM-DD)"
                        placeholderTextColor={colors.textMuted}
                        value={dateFilter}
                        onChangeText={setDateFilter}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {!!dateFilter && (
                        <Pressable onPress={() => setDateFilter("")}>
                            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                        </Pressable>
                    )}
                </View>

                {patientFilter ? (
                    <Card style={styles.patientFilterCard}>
                        <Ionicons name="person" size={18} color={colors.primaryDark} />
                        <Text style={styles.patientFilterText}>
                            Showing prescriptions for {matchedPatientName ?? patientFilter}
                            {matchedPatientName ? ` (${patientFilter})` : ""}
                        </Text>
                        <Pressable onPress={() => setPatientFilter(null)}>
                            <Text style={styles.clearText}>Clear</Text>
                        </Pressable>
                    </Card>
                ) : (
                    <Card style={{ marginBottom: spacing.md }}>
                        <Text style={styles.lookupTitle}>Look up by patient</Text>
                        <Button
                            title="Scan Patient Medical ID"
                            icon="scan"
                            variant="secondary"
                            onPress={() => setScannerOpen(true)}
                        />
                        <View style={styles.divider}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>or enter manually</Text>
                            <View style={styles.dividerLine} />
                        </View>
                        <Input
                            placeholder="Medical ID (e.g. AYU-200012345678)"
                            value={patientIdInput}
                            onChangeText={setPatientIdInput}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            onSubmitEditing={() => applyPatientFilter(patientIdInput)}
                            style={{ marginBottom: 0 }}
                        />
                    </Card>
                )}

                {loading ? (
                    <ActivityIndicator
                        size="large"
                        color={colors.primaryDark}
                        style={{ marginTop: spacing.xl }}
                    />
                ) : (
                    <FlatList
                        data={filtered}
                        keyExtractor={(p) => p.id}
                        renderItem={({ item }) => (
                            <PrescriptionCard
                                prescription={item}
                                perspective="doctor"
                                canModify={canModify(item)}
                                modifying={deletingId === item.id}
                                onEdit={() => startEdit(item)}
                                onDelete={() => setDeleteTarget(item)}
                            />
                        )}
                        contentContainerStyle={{ paddingBottom: spacing.xl }}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => {
                                    setRefreshing(true);
                                    load();
                                }}
                                tintColor={colors.primaryDark}
                            />
                        }
                        ListEmptyComponent={
                            <EmptyState
                                icon="document-text-outline"
                                title="Nothing here"
                                message={
                                    search || dateFilter || patientFilter
                                        ? "Try adjusting your search, date, or patient filter."
                                        : "Prescriptions you issue will appear here."
                                }
                            />
                        }
                    />
                )}
            </View>

            <QRScannerModal
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScanned={applyPatientFilter}
                title="Scan Patient Medical ID"
            />

            <ConfirmModal
                visible={!!deleteTarget}
                title="Delete this prescription?"
                message={
                    deleteTarget
                        ? `"${deleteTarget.diagnosis}" for ${deleteTarget.patient?.firstName ?? ""} ${
                              deleteTarget.patient?.lastName ?? ""
                          } will be permanently removed. This can't be undone.`
                        : ""
                }
                confirmLabel="Delete"
                destructive
                loading={!!deleteTarget && deletingId === deleteTarget.id}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, padding: spacing.lg, paddingBottom: 0 },
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 12,
        marginBottom: spacing.sm,
    },
    dateBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 12,
        marginBottom: spacing.md,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 11,
        fontSize: 14,
        color: colors.text,
    },
    lookupTitle: { fontSize: 13, fontWeight: "800", color: colors.primaryDark, marginBottom: spacing.sm },
    divider: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginVertical: spacing.sm,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { fontSize: 12, color: colors.textMuted },
    patientFilterCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: spacing.md,
        backgroundColor: colors.primarySoft,
    },
    patientFilterText: { flex: 1, fontSize: 12.5, fontWeight: "600", color: colors.primaryDark },
    clearText: { fontSize: 12.5, fontWeight: "700", color: colors.danger },
});
