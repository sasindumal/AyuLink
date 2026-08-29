// ==============================================
// AyuLink Doctor - Profile & Settings
//
// Everything registration collected, in one place: the identity fields
// that can never change (NIC, Medical ID), the ones that can (name,
// phone, date of birth), and the role-specific details. Sign out lives
// at the bottom, behind a confirmation — it used to be a one-tap icon in
// the top-right corner, which is a poor home for the one action that
// ends your session.
// ==============================================

import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../src/lib/api";
import { useAuth } from "../src/lib/auth";
import { colors, radius, spacing } from "../src/theme";
import { Banner, Button, Input, formatDate } from "../src/components/ui";
import { ConfirmModal } from "../src/components/ConfirmModal";

interface FullProfile {
    id: string;
    nicNumber: string;
    firstName: string;
    lastName: string;
    mobileNumber?: string;
    dob?: string;
    gender?: "MALE" | "FEMALE" | null;
    role: string;
    medicalId: string;
    verified: boolean;
    memberSince?: string;
    doctorProfile?: { slmcRegNo?: string; specialization?: string; rating?: number | null; specialties?: string[] } | null;
    pharmacyProfile?: { pharmacyName?: string; licenseNumber?: string } | null;
    channelingCenter?: { name?: string; address?: string; city?: string; contactNumber?: string } | null;
}

function Row({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null;
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
        </View>
    );
}

export default function Profile() {
    const { logout } = useAuth();
    const [profile, setProfile] = useState<FullProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [signOutOpen, setSignOutOpen] = useState(false);
    const [form, setForm] = useState({ firstName: "", lastName: "", mobileNumber: "", dob: "" });

    const load = useCallback(async () => {
        try {
            const p = await rpc<FullProfile>("app_get_my_profile");
            setProfile(p);
            setForm({
                firstName: p.firstName ?? "",
                lastName: p.lastName ?? "",
                mobileNumber: p.mobileNumber ?? "",
                dob: p.dob ? p.dob.slice(0, 10) : "",
            });
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't load your profile");
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            await rpc("app_update_my_account", {
                p_payload: {
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    mobileNumber: form.mobileNumber.trim(),
                    dob: form.dob.trim() ? new Date(form.dob.trim()).toISOString() : undefined,
                },
            });
            setEditing(false);
            setNotice("Profile updated.");
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't save your changes");
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={6}>
                    <Ionicons name="arrow-back" size={22} color={colors.primaryDark} />
                </Pressable>
                <Text style={styles.headerTitle}>Profile</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
            ) : (
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                    {error && <Banner kind="error" message={error} />}
                    {notice && <Banner kind="info" message={notice} />}

                    <View style={styles.identity}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                                {`${profile?.firstName?.charAt(0) ?? ""}${profile?.lastName?.charAt(0) ?? ""}`.toUpperCase()}
                            </Text>
                        </View>
                        <Text style={styles.name}>
                            {profile?.firstName} {profile?.lastName}
                        </Text>
                        <Text style={styles.medicalId}>{profile?.medicalId}</Text>
                        {profile && !profile.verified && (
                            <View style={styles.pending}>
                                <Ionicons name="time-outline" size={13} color={colors.warningInk} />
                                <Text style={styles.pendingText}>Verification pending</Text>
                            </View>
                        )}
                    </View>

                    <Text style={styles.sectionTitle}>Account details</Text>
                    <View style={styles.card}>
                        {editing ? (
                            <>
                                <View style={{ flexDirection: "row", gap: 10 }}>
                                    <View style={{ flex: 1 }}>
                                        <Input label="First Name" value={form.firstName}
                                            onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Input label="Last Name" value={form.lastName}
                                            onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))} />
                                    </View>
                                </View>
                                <Input label="Mobile Number" value={form.mobileNumber} keyboardType="phone-pad"
                                    onChangeText={(v) => setForm((f) => ({ ...f, mobileNumber: v }))} />
                                <Input label="Date of Birth" placeholder="YYYY-MM-DD" value={form.dob}
                                    autoCorrect={false}
                                    onChangeText={(v) => setForm((f) => ({ ...f, dob: v }))} />
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                    <Button title="Cancel" variant="secondary" style={{ flex: 1 }}
                                        onPress={() => { setEditing(false); load(); }} disabled={saving} />
                                    <Button title="Save" style={{ flex: 1 }} onPress={save} loading={saving} />
                                </View>
                            </>
                        ) : (
                            <>
                                <Row label="Mobile" value={profile?.mobileNumber} />
                                <Row label="Date of birth" value={profile?.dob ? formatDate(profile.dob) : null} />
                                <Row label="Gender" value={
                                    profile?.gender === "MALE" ? "Male"
                                        : profile?.gender === "FEMALE" ? "Female" : null
                                } />
                                {/* NIC and Medical ID are read-only on purpose: the
                                    Medical ID every QR encodes is derived from the NIC,
                                    so letting it drift would break codes already in
                                    circulation. */}
                                <Row label="NIC" value={profile?.nicNumber} />
                                <Row label="Member since" value={profile?.memberSince ? formatDate(profile.memberSince) : null} />
                                <Button title="Edit details" variant="secondary" icon="create-outline"
                                    onPress={() => { setNotice(null); setEditing(true); }}
                                    style={{ marginTop: spacing.sm }} />
                            </>
                        )}
                    </View>

                    <Text style={styles.sectionTitle}>Practice</Text>
                    <View style={styles.card}>
                        <Row label="SLMC number" value={profile?.doctorProfile?.slmcRegNo} />
                        <Row label="Primary specialty" value={profile?.doctorProfile?.specialization} />
                        <Row label="All specialties" value={profile?.doctorProfile?.specialties?.join(", ")} />
                        <Row label="Rating" value={profile?.doctorProfile?.rating != null ? `${profile.doctorProfile.rating.toFixed(1)} / 5` : null} />
                    </View>

                    <Text style={styles.sectionTitle}>Session</Text>
                    <View style={styles.card}>
                        <Button title="Sign out" variant="secondary" icon="log-out-outline"
                            onPress={() => setSignOutOpen(true)} />
                    </View>
                </ScrollView>
            )}

            <ConfirmModal
                visible={signOutOpen}
                title="Sign out?"
                message="You'll need your NIC and password to sign back in."
                confirmLabel="Sign out"
                destructive
                onConfirm={() => { setSignOutOpen(false); logout(); }}
                onCancel={() => setSignOutOpen(false)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    backBtn: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 20, fontWeight: "800", color: colors.text },
    scroll: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xl },
    identity: { alignItems: "center", paddingVertical: spacing.lg },
    avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryDark, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
    avatarText: { color: "#fff", fontSize: 26, fontWeight: "800" },
    name: { fontSize: 19, fontWeight: "800", color: colors.text },
    medicalId: { fontSize: 13, color: colors.textMuted, marginTop: 2, letterSpacing: 0.4 },
    pending: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, backgroundColor: colors.warningSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
    pendingText: { fontSize: 12, fontWeight: "700", color: colors.warningInk },
    sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
    card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLabel: { fontSize: 13, color: colors.textMuted },
    rowValue: { fontSize: 14, fontWeight: "600", color: colors.text, flexShrink: 1, textAlign: "right" },
    linkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13 },
    linkText: { flex: 1, fontSize: 14.5, fontWeight: "700", color: colors.text },
    linkHint: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
