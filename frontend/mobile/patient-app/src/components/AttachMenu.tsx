// ==============================================
// AyuLink Patient - Attach Menu
// Bottom-sheet style picker for the Diagnosis chat's
// single attach button (photo vs. document) — keeps
// the input bar to one fixed-width button instead of
// two, leaving more room for the text field on narrow
// screens.
// ==============================================

import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";

export function AttachMenu({
    visible,
    onClose,
    onPickImage,
    onPickDocument,
}: {
    visible: boolean;
    onClose: () => void;
    onPickImage: () => void;
    onPickDocument: () => void;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.handle} />
                    <Text style={styles.title}>Attach</Text>

                    <Pressable
                        style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                        onPress={() => {
                            onClose();
                            onPickImage();
                        }}
                    >
                        <View style={styles.optionIcon}>
                            <Ionicons name="image" size={20} color={colors.primaryDark} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.optionTitle}>Photo</Text>
                            <Text style={styles.optionSubtitle}>Pick a photo from your library</Text>
                        </View>
                    </Pressable>

                    <Pressable
                        style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                        onPress={() => {
                            onClose();
                            onPickDocument();
                        }}
                    >
                        <View style={styles.optionIcon}>
                            <Ionicons name="document-text" size={20} color={colors.primaryDark} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.optionTitle}>Medical report (PDF)</Text>
                            <Text style={styles.optionSubtitle}>Attach a document</Text>
                        </View>
                    </Pressable>

                    <Pressable style={styles.cancelBtn} onPress={onClose}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(28, 43, 26, 0.45)",
        justifyContent: "flex-end",
    },
    sheet: {
        width: "100%",
        maxWidth: 480,
        alignSelf: "center",
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        padding: spacing.lg,
        paddingBottom: spacing.xl,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
        alignSelf: "center",
        marginBottom: spacing.md,
    },
    title: { fontSize: 15, fontWeight: "800", color: colors.text, marginBottom: spacing.sm },
    option: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        borderRadius: radius.sm,
    },
    optionPressed: { backgroundColor: colors.primarySoft },
    optionIcon: {
        width: 40,
        height: 40,
        borderRadius: radius.sm,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
    },
    optionTitle: { fontSize: 14.5, fontWeight: "700", color: colors.text },
    optionSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    cancelBtn: {
        marginTop: spacing.sm,
        paddingVertical: 13,
        alignItems: "center",
        borderRadius: radius.sm,
        backgroundColor: colors.neutralSoft,
    },
    cancelText: { fontSize: 14, fontWeight: "700", color: colors.text },
});
