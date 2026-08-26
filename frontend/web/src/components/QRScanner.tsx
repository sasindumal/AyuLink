// ==============================================
// AyuLink - QR Code Scanner Component
// Camera-based QR scanner using html5-qrcode
// ==============================================

"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, X, ScanLine } from "lucide-react";

interface QRScannerProps {
    /** Called when a QR code is successfully decoded */
    onScan: (data: string) => void;
    /** Called when the scanner is closed */
    onClose: () => void;
    /** Whether the scanner modal is open */
    isOpen: boolean;
}

export default function QRScanner({ onScan, onClose, isOpen }: QRScannerProps) {
    const [error, setError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const containerRef = useRef<string>("qr-reader-" + Date.now());

    useEffect(() => {
        if (!isOpen) return;

        const startScanner = async () => {
            try {
                const scanner = new Html5Qrcode(containerRef.current);
                scannerRef.current = scanner;

                await scanner.start(
                    { facingMode: "environment" },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                    },
                    (decodedText) => {
                        // QR code decoded — pass data up
                        onScan(decodedText);
                        // Stop scanner after successful scan
                        scanner.stop().catch(console.error);
                    },
                    () => {
                        // Scan failure (no QR found in frame) — ignore
                    }
                );
            } catch (err) {
                setError("Unable to access camera. Please grant camera permissions.");
                console.error("QR Scanner error:", err);
            }
        };

        // Small delay to ensure DOM is ready
        const timeout = setTimeout(startScanner, 300);

        return () => {
            clearTimeout(timeout);
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => { });
            }
        };
    }, [isOpen, onScan]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="card w-full max-w-md mx-4 p-6 relative">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-background transition-colors"
                >
                    <X className="w-5 h-5 text-text-muted" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-xl bg-primary-action/10">
                        <Camera className="w-6 h-6 text-primary-action" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-primary-dark">Scan QR Code</h3>
                        <p className="text-sm text-text-muted">
                            Point your camera at the patient&apos;s Medical ID
                        </p>
                    </div>
                </div>

                {/* Scanner Container */}
                <div className="relative rounded-2xl overflow-hidden bg-black">
                    <div id={containerRef.current} className="w-full" />

                    {/* Scanning overlay animation */}
                    {!error && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <div className="w-64 h-64 border-2 border-primary-action/50 rounded-2xl relative">
                                <ScanLine className="w-full h-1 text-primary-action absolute top-1/2 animate-pulse-soft" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200">
                        <p className="text-sm text-red-600">{error}</p>
                    </div>
                )}

                {/* Tip */}
                <p className="text-xs text-text-muted text-center mt-4">
                    Hold steady for best results • Ensure good lighting
                </p>
            </div>
        </div>
    );
}
