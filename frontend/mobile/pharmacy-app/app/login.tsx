// ==============================================
// AyuLink Pharmacy - Login
// Pharmacy license number or NIC + password
// ==============================================

import React, { useState } from "react";
import {
    Image,
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
import { colors, radius, spacing } from "../src/theme";
import { Banner, Button, Input } from "../src/components/ui";

type Mode = "license" | "nic";

export default function Login() {
    const { login, logout } = useAuth();
    const [mode, setMode] = useState<Mode>("license");
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const switchMode = (next: Mode) => {
        setMode(next);
        setIdentifier("");
        setError(null);
    };

    const submit = async () => {
        if (!identifier.trim() || !password) {
            setError(
                mode === "license"
                    ? "Please enter your license number and password"
                    : "Please enter your NIC number and password"
            );
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const fields =
                mode === "license"
                    ? { licenseNumber: identifier.trim(), password }
                    : { nicNumber: identifier.trim(), password };
            const user = await login(fields);
            if (user.role !== "PHARMACIST") {
                await logout();
                setError(
                    "This app is for pharmacies. Please use the AyuLink app for your role."
                );
                setLoading(false);
                return;
            }
            router.replace("/(tabs)/home");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Login failed");
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
                    <View style={styles.brand}>
                        <Image
                            source={require("../assets/icon-mark.png")}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.title}>AyuLink Pharmacy</Text>
                        <Text style={styles.subtitle}>
                            Scan, dispense, and keep a clean audit trail
                        </Text>
                    </View>

                    <View style={styles.form}>
                        {error && <Banner kind="error" message={error} />}

                        <View style={styles.tabs}>
                            <Pressable
                                onPress={() => switchMode("license")}
                                style={[styles.tab, mode === "license" && styles.tabActive]}
                            >
                                <Text
                                    style={[
                                        styles.tabText,
                                        mode === "license" && styles.tabTextActive,
                                    ]}
                                >
                                    License No
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={() => switchMode("nic")}
                                style={[styles.tab, mode === "nic" && styles.tabActive]}
                            >
                                <Text
                                    style={[
                                        styles.tabText,
                                        mode === "nic" && styles.tabTextActive,
                                    ]}
                                >
                                    NIC Number
                                </Text>
                            </Pressable>
                        </View>

                        <Input
                            label={mode === "license" ? "Pharmacy License Number" : "NIC Number"}
                            placeholder={mode === "license" ? "PL-2024-001" : "199512345678"}
                            value={identifier}
                            onChangeText={setIdentifier}
                            autoCapitalize="characters"
                            autoCorrect={false}
                        />

                        <Text style={styles.inputLabel}>Password</Text>
                        <View style={styles.passwordRow}>
                            <Input
                                placeholder="Your password"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                style={{ paddingRight: 44 }}
                            />
                            <Pressable
                                style={styles.eye}
                                onPress={() => setShowPassword((v) => !v)}
                            >
                                <Ionicons
                                    name={showPassword ? "eye-off" : "eye"}
                                    size={20}
                                    color={colors.textMuted}
                                />
                            </Pressable>
                        </View>

                        <Button title="Sign In" onPress={submit} loading={loading} />

                        <View style={styles.footer}>
                            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                                New pharmacy?{" "}
                            </Text>
                            <Link href="/register" style={styles.link}>
                                Register here
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
    scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.lg },
    brand: { alignItems: "center", marginBottom: spacing.xl },
    logo: {
        width: 88,
        height: 88,
        marginBottom: spacing.md,
    },
    title: { fontSize: 27, fontWeight: "800", color: colors.primaryDark },
    subtitle: {
        fontSize: 13.5,
        color: colors.textMuted,
        marginTop: 4,
        textAlign: "center",
    },
    form: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
    },
    tabs: {
        flexDirection: "row",
        backgroundColor: colors.background,
        borderRadius: radius.sm,
        padding: 4,
        marginBottom: spacing.md,
    },
    tab: {
        flex: 1,
        paddingVertical: 9,
        borderRadius: radius.sm - 3,
        alignItems: "center",
    },
    tabActive: { backgroundColor: colors.primaryDark },
    tabText: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
    tabTextActive: { color: "#fff" },
    inputLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 6,
    },
    passwordRow: { position: "relative" },
    eye: { position: "absolute", right: 14, top: 13 },
    footer: {
        flexDirection: "row",
        justifyContent: "center",
        marginTop: spacing.md,
    },
    link: { color: colors.primary, fontWeight: "700", fontSize: 13 },
});
