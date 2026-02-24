// ==============================================
// AyuLink - QR Code Display Component
// Reusable floating card showing the user's Medical ID QR
// ==============================================

"use client";

import { QRCodeSVG } from "qrcode.react";

interface QRCodeDisplayProps {
    /** The medical ID string to encode in the QR code */
    medicalId: string;
    /** Patient's full name to display */
    patientName: string;
    /** Size of the QR code in pixels */
    size?: number;
}

export default function QRCodeDisplay({
    medicalId,
    patientName,
    size = 200,
}: QRCodeDisplayProps) {
    return (
        <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            {/* Header */}
            <div className="text-center">
                <p className="text-sm font-medium text-text-muted uppercase tracking-wider">
                    Digital Medical ID
                </p>
                <h3 className="text-xl font-bold text-primary-dark mt-1">{patientName}</h3>
            </div>

            {/* QR Code Container */}
            <div className="relative p-4 bg-white rounded-2xl shadow-inner border border-border">
                {/* Decorative corner accents */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-primary-action rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-primary-action rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-primary-action rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-primary-action rounded-br-xl" />

                <QRCodeSVG
                    value={medicalId}
                    size={size}
                    level="H"
                    bgColor="#FFFFFF"
                    fgColor="#25671E"
                    includeMargin={true}
                />
            </div>

            {/* Medical ID text */}
            <div className="text-center">
                <p className="text-xs text-text-muted">Medical ID</p>
                <p className="text-sm font-mono font-medium text-primary-dark mt-0.5 select-all">
                    {medicalId.slice(0, 8)}...{medicalId.slice(-4)}
                </p>
            </div>

            {/* Powered by line */}
            <div className="flex items-center gap-2 text-xs text-text-muted">
                <div className="w-2 h-2 rounded-full bg-primary-action animate-pulse-soft" />
                <span>Verified by AyuLink</span>
            </div>
        </div>
    );
}
