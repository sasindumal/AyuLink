// ==============================================
// AyuLink Mobile - QR Scanner Modal
// Camera overlay that fires once per open
// ==============================================

import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Button } from "./ui";

export function QRScannerModal({
    visible,
    onClose,
    onScanned,
    title = "Scan Medical ID",
}: {
    visible: boolean;
    onClose: () => void;
    onScanned: (data: string) => void;
    title?: string;
}) {
    const [permission, requestPermission] = useCameraPermissions();
    const handled = useRef(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (visible) {
            handled.current = false;
            setReady(true);
        } else {
            setReady(false);
        }
    }, [visible]);

    const handleBarcode = ({ data }: { data: string }) => {
        if (handled.current || !data) return;
        handled.current = true;
        onScanned(data.trim());
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>{title}</Text>
                    <Pressable onPress={onClose} style={styles.close}>
                        <Ionicons name="close" size={22} color="#fff" />
                    </Pressable>
                </View>

                {!permission?.granted ? (
                    <View style={styles.permission}>
                        <Ionicons name="camera" size={44} color="#fff" />
                        <Text style={styles.permissionText}>
                            Camera access is needed to scan patient QR codes.
                        </Text>
                        <Button
                            title="Allow Camera"
                            onPress={() => requestPermission()}
                            style={{ minWidth: 180 }}
                        />
                    </View>
                ) : (
                    ready && (
                        <CameraView
                            style={StyleSheet.absoluteFillObject}
                            facing="back"
                            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                            onBarcodeScanned={handleBarcode}
                        />
                    )
                )}

                {permission?.granted && (
                    <View pointerEvents="none" style={styles.overlay}>
                        <View style={styles.frame} />
                        <Text style={styles.hint}>
                            Hold steady · Ensure good lighting
                        </Text>
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0B1809" },
    header: {
        position: "absolute",
        top: 60,
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.lg,
    },
    title: { color: "#fff", fontSize: 17, fontWeight: "800" },
    close: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: "rgba(255,255,255,0.18)",
        alignItems: "center",
        justifyContent: "center",
    },
    permission: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.md,
        padding: spacing.xl,
    },
    permissionText: {
        color: "#D8E5D4",
        fontSize: 14,
        textAlign: "center",
        lineHeight: 20,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    frame: {
        width: 240,
        height: 240,
        borderRadius: radius.lg,
        borderWidth: 3,
        borderColor: colors.primary,
    },
    hint: {
        color: "#D8E5D4",
        fontSize: 13,
        marginTop: spacing.md,
        fontWeight: "600",
    },
});
