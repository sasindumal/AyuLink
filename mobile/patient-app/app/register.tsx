// ==============================================
// AyuLink Patient - Registration
// Simple details for now — profile can be
// completed later
// ==============================================

import React, { useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import { api } from "../src/lib/api";
import { useAuth } from "../src/lib/auth";
import { colors, radius, spacing } from "../src/theme";
import { Banner, Button, Input } from "../src/components/ui";

export default function Register() {
    const { login } = useAuth();
    const [form, setForm] = useState({
        nicNumber: "",
        firstName: "",
        lastName: "",
        mobileNumber: "",
        dob: "",
        password: "",
        confirm: "",
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((f) => ({ ...f, [key]: value }));

    const submit = async () => {
        const { nicNumber, firstName, lastName, mobileNumber, dob, password, confirm } =
            form;
        if (!nicNumber || !firstName || !lastName || !mobileNumber || !dob || !password) {
            setError("Please fill in all fields");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            await api("/api/auth/register", {
                method: "POST",
                body: {
                    nicNumber: nicNumber.trim(),
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    mobileNumber: mobileNumber.trim(),
                    dob: dob.trim(),
                    password,
                    role: "PATIENT",
                },
            });
            // Sign straight in for a smooth first-run experience
            await login({ nicNumber: nicNumber.trim(), password });
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
                    <Text style={styles.title}>Create your account</Text>
                    <Text style={styles.subtitle}>
                        Get your Digital Medical ID in under a minute
                    </Text>

                    <View style={styles.form}>
                        {error && <Banner kind="error" message={error} />}

                        <Input
                            label="NIC Number"
                            placeholder="200012345678 or 981234567V"
                            value={form.nicNumber}
                            onChangeText={set("nicNumber")}
                            autoCapitalize="characters"
                            autoCorrect={false}
                        />
                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Input
                                    label="First Name"
                                    placeholder="Sasindu"
                                    value={form.firstName}
                                    onChangeText={set("firstName")}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Input
                                    label="Last Name"
                                    placeholder="Malhara"
                                    value={form.lastName}
                                    onChangeText={set("lastName")}
                                />
                            </View>
                        </View>
                        <Input
                            label="Mobile Number"
                            placeholder="0771234567"
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

                        <Button
                            title="Create Account"
                            onPress={submit}
                            loading={loading}
                        />

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
    row: { flexDirection: "row", gap: 12 },
    footer: {
        flexDirection: "row",
        justifyContent: "center",
        marginTop: spacing.md,
    },
    link: { color: colors.primary, fontWeight: "700", fontSize: 13 },
});
