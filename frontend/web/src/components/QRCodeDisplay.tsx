// ==============================================
// AyuLink - QR Code Display Component
// Reusable floating card showing the user's Medical ID QR
// ==============================================

"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ClipboardCheck } from "lucide-react";

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
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(medicalId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const textArea = document.createElement("textarea");
            textArea.value = medicalId;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

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

            {/* Medical ID with Copy Button */}
            <div className="text-center w-full">
                <p className="text-xs text-text-muted mb-1">Medical ID</p>
                <button
                    onClick={handleCopy}
                    className={`
                        w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                        font-mono text-sm font-medium transition-all duration-300 cursor-pointer
                        ${copied
                            ? "bg-primary-action/10 text-primary-action border border-primary-action/20"
                            : "bg-background text-primary-dark border border-border hover:border-primary-action/40 hover:bg-primary-action/5"
                        }
                    `}
                    title="Click to copy Medical ID"
                >
                    {copied ? (
                        <>
                            <ClipboardCheck className="w-4 h-4 shrink-0" />
                            <span>Copied!</span>
                        </>
                    ) : (
                        <>
                            <span className="truncate">{medicalId}</span>
                            <Copy className="w-4 h-4 shrink-0 text-text-muted" />
                        </>
                    )}
                </button>
            </div>

            {/* Powered by line */}
            <div className="flex items-center gap-2 text-xs text-text-muted">
                <div className="w-2 h-2 rounded-full bg-primary-action animate-pulse-soft" />
                <span>Verified by AyuLink</span>
            </div>
        </div>
    );
}
