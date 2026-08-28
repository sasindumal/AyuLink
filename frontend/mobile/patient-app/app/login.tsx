// ==============================================
// AyuLink Patient - Login
// NIC number + password
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

export default function Login() {
    const { login, logout } = useAuth();
    const [nicNumber, setNicNumber] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (!nicNumber.trim() || !password) {
            setError("Please enter your NIC number and password");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const user = await login({ nicNumber: nicNumber.trim(), password });
            if (user.role !== "PATIENT") {
                await logout();
                setError("This app is for patients. Please use the AyuLink app for your role.");
                return;
            }
            router.replace("/(tabs)/home");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Login failed");
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
                    <View style={styles.brand}>
                        <Image
                            source={require("../assets/icon-mark.png")}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.title}>AyuLink</Text>
                        <Text style={styles.subtitle}>
                            Your personal AI health assistant & digital health ID
                        </Text>
                    </View>

                    <View style={styles.form}>
                        {error && <Banner kind="error" message={error} />}

                        <Input
                            label="NIC Number"
                            placeholder="200012345678"
                            value={nicNumber}
                            onChangeText={setNicNumber}
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
                                New to AyuLink?{" "}
                            </Text>
                            <Link href="/register" style={styles.link}>
                                Create an account
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
        width: 96,
        height: 96,
        marginBottom: spacing.md,
    },
    title: { fontSize: 30, fontWeight: "800", color: colors.primaryDark },
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
    link: { color: colors.primaryDark, fontWeight: "700", fontSize: 13 },
});
