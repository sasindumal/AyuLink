// ==============================================
// AyuLink Doctor - Registration
// Simple details + professional info.
// New doctors start unverified.
// ==============================================

import React, { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import { useAuth } from "../src/lib/auth";
import { colors, radius, spacing } from "../src/theme";
import { Banner, Button, Input } from "../src/components/ui";

export default function Register() {
    const { register } = useAuth();
    const [form, setForm] = useState({
        nicNumber: "",
        firstName: "",
        lastName: "",
        mobileNumber: "",
        dob: "",
        slmcRegNo: "",
        specialization: "",
        password: "",
        confirm: "",
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((f) => ({ ...f, [key]: value }));

    const submit = async () => {
        const required = [
            form.nicNumber, form.firstName, form.lastName, form.mobileNumber,
            form.dob, form.slmcRegNo, form.specialization,
            form.password,
        ];
        if (required.some((v) => !v.trim())) {
            setError("Please fill in all fields");
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
                    role: "DOCTOR",
                    slmcRegNo: form.slmcRegNo.trim(),
                    specialization: form.specialization.trim(),
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

                        <Text style={styles.section}>Professional details</Text>
                        <Input
                            label="SLMC Registration No"
                            placeholder="SLMC-12345"
                            value={form.slmcRegNo}
                            onChangeText={set("slmcRegNo")}
                            autoCapitalize="characters"
                        />
                        <Input
                            label="Specialization"
                            placeholder="Cardiology"
                            value={form.specialization}
                            onChangeText={set("specialization")}
                        />

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
    footer: {
        flexDirection: "row",
        justifyContent: "center",
        marginTop: spacing.md,
    },
    link: { color: colors.primary, fontWeight: "700", fontSize: 13 },
});
