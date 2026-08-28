// ==============================================
// AyuLink Patient - Confirm Modal
// Yes/No confirmation with an optional reason field.
// RN's Alert.prompt is iOS-only, so cancel flows that
// want a free-text reason need a real modal.
// ==============================================

import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";
import { Button, Input } from "./ui";

export function ConfirmModal({
    visible,
    title,
    message,
    confirmLabel = "Confirm",
    destructive = false,
    showReasonInput = false,
    reasonPlaceholder = "Reason (optional)",
    loading = false,
    onConfirm,
    onCancel,
}: {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    destructive?: boolean;
    showReasonInput?: boolean;
    reasonPlaceholder?: string;
    loading?: boolean;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
}) {
    const [reason, setReason] = useState("");

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.message}>{message}</Text>

                    {showReasonInput && (
                        <Input
                            placeholder={reasonPlaceholder}
                            value={reason}
                            onChangeText={setReason}
                        />
                    )}

                    <View style={styles.row}>
                        <Pressable style={styles.cancelBtn} onPress={onCancel}>
                            <Text style={styles.cancelText}>Back</Text>
                        </Pressable>
                        <View style={{ flex: 1 }}>
                            <Button
                                title={confirmLabel}
                                variant={destructive ? "danger-ghost" : "primary"}
                                loading={loading}
                                onPress={() => onConfirm(reason.trim())}
                            />
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(28, 43, 26, 0.45)",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
    },
    card: {
        width: "100%",
        maxWidth: 420,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
    },
    title: { fontSize: 17, fontWeight: "800", color: colors.text, marginBottom: 6 },
    message: { fontSize: 13.5, color: colors.textMuted, marginBottom: spacing.md },
    row: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: spacing.xs },
    cancelBtn: { paddingVertical: 12, paddingHorizontal: 6 },
    cancelText: { color: colors.textMuted, fontWeight: "700", fontSize: 13.5 },
});
