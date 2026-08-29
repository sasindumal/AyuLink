// ==============================================
// AyuLink Doctor - Registration
// Simple details + professional info.
// New doctors start unverified.
// ==============================================

import React, { useEffect, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/lib/auth";
import { rpc } from "../src/lib/api";
import { colors, radius, spacing } from "../src/theme";
import { Banner, Button, FilterChips, Input } from "../src/components/ui";

const MAX_SPECIALTIES = 5;

const GENDER_OPTIONS = [
    { key: "MALE", label: "Male" },
    { key: "FEMALE", label: "Female" },
];

interface Specialty {
    id: string;
    name: string;
}

export default function Register() {
    const { register } = useAuth();
    const [form, setForm] = useState({
        nicNumber: "",
        firstName: "",
        lastName: "",
        mobileNumber: "",
        dob: "",
        gender: "",
        slmcRegNo: "",
        password: "",
        confirm: "",
    });
    const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
    const [specialties, setSpecialties] = useState<Specialty[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        rpc<Specialty[]>("app_list_specialties")
            .then((data) => setSpecialties(data ?? []))
            .catch(() => {});
    }, []);

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((f) => ({ ...f, [key]: value }));

    const toggleSpecialty = (id: string) => {
        setSpecialtyIds((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= MAX_SPECIALTIES) return prev;
            return [...prev, id];
        });
    };

    const submit = async () => {
        const required = [
            form.nicNumber, form.firstName, form.lastName, form.mobileNumber,
            form.dob, form.slmcRegNo,
            form.password,
        ];
        if (required.some((v) => !v.trim())) {
            setError("Please fill in all fields");
            return;
        }
        if (!form.gender) {
            setError("Please select a gender");
            return;
        }
        if (specialtyIds.length === 0) {
            setError("Please select at least one specialty");
            return;
        }
        if (form.password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (form.password !== form.confirm) {
            setError("Passwords do not match");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            await register(
                {
                    nicNumber: form.nicNumber.trim(),
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    mobileNumber: form.mobileNumber.trim(),
                    dob: form.dob.trim(),
                    gender: form.gender,
                    role: "DOCTOR",
                    slmcRegNo: form.slmcRegNo.trim(),
                    specialtyIds,
                },
                form.password
            );
            Alert.alert(
                "Welcome to AyuLink",
                "Your account was created and is pending verification. You can explore the app now; issuing prescriptions is enabled once your SLMC credentials are approved."
            );
            router.replace("/(tabs)/home");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.title}>Doctor registration</Text>
                    <Text style={styles.subtitle}>
                        Your SLMC credentials are reviewed before you can issue
                        prescriptions
                    </Text>

                    <View style={styles.form}>
                        {error && <Banner kind="error" message={error} />}

                        <Text style={styles.section}>Personal details</Text>
                        <Input
                            label="NIC Number"
                            placeholder="199812345678"
                            value={form.nicNumber}
                            onChangeText={set("nicNumber")}
                            autoCapitalize="characters"
                            autoCorrect={false}
                        />
                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Input
                                    label="First Name"
                                    placeholder="Amal"
                                    value={form.firstName}
                                    onChangeText={set("firstName")}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Input
                                    label="Last Name"
                                    placeholder="Perera"
                                    value={form.lastName}
                                    onChangeText={set("lastName")}
                                />
                            </View>
                        </View>
                        <Input
                            label="Mobile Number"
                            placeholder="0779876543"
                            value={form.mobileNumber}
                            onChangeText={set("mobileNumber")}
                            keyboardType="phone-pad"
                        />
                        <Input
                            label="Date of Birth"
                            placeholder="YYYY-MM-DD"
                            value={form.dob}
                            onChangeText={set("dob")}
                            autoCorrect={false}
                        />
                        <Text style={styles.inputLabel}>Gender</Text>
                        <FilterChips
                            value={form.gender}
                            onChange={set("gender")}
                            options={GENDER_OPTIONS}
                        />

                        <Text style={styles.section}>Professional details</Text>
                        <Input
                            label="SLMC Registration No"
                            placeholder="SLMC-12345"
                            value={form.slmcRegNo}
                            onChangeText={set("slmcRegNo")}
                            autoCapitalize="characters"
                        />
                        <Text style={styles.inputLabel}>
                            Specialties (up to {MAX_SPECIALTIES})
                        </Text>
                        <View style={styles.specialtyChipRow}>
                            {specialties.map((s) => {
                                const active = specialtyIds.includes(s.id);
                                const disabled = !active && specialtyIds.length >= MAX_SPECIALTIES;
                                return (
                                    <Pressable
                                        key={s.id}
                                        onPress={() => toggleSpecialty(s.id)}
                                        disabled={disabled}
                                        style={[
                                            styles.specialtyChip,
                                            active && styles.specialtyChipActive,
                                            disabled && styles.specialtyChipDisabled,
                                        ]}
                                    >
                                        {active && (
                                            <Ionicons
                                                name="checkmark"
                                                size={13}
                                                color="#fff"
                                                style={{ marginRight: 4 }}
                                            />
                                        )}
                                        <Text
                                            style={[
                                                styles.specialtyChipText,
                                                active && styles.specialtyChipTextActive,
                                            ]}
                                        >
                                            {s.name}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                        {specialtyIds.length >= MAX_SPECIALTIES && (
                            <Text style={styles.specialtyHint}>
                                Maximum of {MAX_SPECIALTIES} specialties selected
                            </Text>
                        )}

                        <Text style={styles.section}>Security</Text>
                        <Input
                            label="Password"
                            placeholder="At least 8 characters"
                            value={form.password}
                            onChangeText={set("password")}
                            secureTextEntry
                            autoCapitalize="none"
                        />
                        <Input
                            label="Confirm Password"
                            placeholder="Repeat your password"
                            value={form.confirm}
                            onChangeText={set("confirm")}
                            secureTextEntry
                            autoCapitalize="none"
                        />

                        <Button title="Create Account" onPress={submit} loading={loading} />

                        <View style={styles.footer}>
                            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                                Already registered?{" "}
                            </Text>
                            <Link href="/login" style={styles.link}>
                                Sign in
                            </Link>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
    title: {
        fontSize: 26,
        fontWeight: "800",
        color: colors.text,
        marginTop: spacing.md,
    },
    subtitle: {
        fontSize: 13.5,
        color: colors.textMuted,
        marginTop: 4,
        marginBottom: spacing.lg,
    },
    form: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
    },
    section: {
        fontSize: 13,
        fontWeight: "800",
        color: colors.primaryDark,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginBottom: spacing.sm,
        marginTop: spacing.sm,
    },
    row: { flexDirection: "row", gap: 12 },
    inputLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 8,
    },
    specialtyChipRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: spacing.sm,
    },
    specialtyChip: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: radius.full,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
    },
    specialtyChipActive: {
        // primaryDark, not primary — white text on #48A111 fails AA (3.29:1).
        backgroundColor: colors.primaryDark,
        borderColor: colors.primaryDark,
    },
    specialtyChipDisabled: {
        opacity: 0.4,
    },
    specialtyChipText: {
        fontSize: 12.5,
        fontWeight: "600",
        color: colors.text,
    },
    specialtyChipTextActive: {
        color: "#fff",
    },
    specialtyHint: {
        fontSize: 11.5,
        color: colors.textMuted,
        marginBottom: spacing.sm,
    },
    footer: {
        flexDirection: "row",
        justifyContent: "center",
        marginTop: spacing.md,
    },
    link: { color: colors.primaryDark, fontWeight: "700", fontSize: 13 },
});
