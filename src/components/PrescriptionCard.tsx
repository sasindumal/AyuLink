// ==============================================
// AyuLink - Prescription Card Component
// Reusable prescription summary with status badge
// ==============================================

"use client";

import { Calendar, User, Stethoscope, Pill, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrescriptionItem {
    id: string;
    drugName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
}

interface PrescriptionCardProps {
    id: string;
    diagnosis: string;
    status: "ACTIVE" | "DISPENSED";
    dateIssued: string;
    doctorName?: string;
    doctorSpecialization?: string;
    hospitalName?: string;
    patientName?: string;
    items: PrescriptionItem[];
    /** When true, show expanded view with all items */
    expanded?: boolean;
    /** Optional click handler */
    onClick?: () => void;
}

export default function PrescriptionCard({
    id,
    diagnosis,
    status,
    dateIssued,
    doctorName,
    doctorSpecialization,
    hospitalName,
    patientName,
    items,
    expanded = false,
    onClick,
}: PrescriptionCardProps) {
    const isActive = status === "ACTIVE";
    const formattedDate = new Date(dateIssued).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });

    return (
        <div
            className={cn(
                "card p-6 cursor-pointer transition-all duration-300 animate-slide-up",
                isActive
                    ? "border-l-4 border-l-primary-action"
                    : "border-l-4 border-l-text-muted/30"
            )}
            onClick={onClick}
        >
            {/* Header Row */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <h4 className="text-lg font-bold text-primary-dark">{diagnosis}</h4>
                    <div className="flex items-center gap-4 mt-2 text-sm text-text-muted">
                        <span className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            {formattedDate}
                        </span>
                        {doctorName && (
                            <span className="flex items-center gap-1.5">
                                <Stethoscope className="w-4 h-4" />
                                Dr. {doctorName}
                            </span>
                        )}
                        {patientName && (
                            <span className="flex items-center gap-1.5">
                                <User className="w-4 h-4" />
                                {patientName}
                            </span>
                        )}
                    </div>
                </div>

                {/* Status Badge */}
                <span className={isActive ? "badge-active" : "badge-dispensed"}>
                    {isActive ? "Active" : "Dispensed"}
                </span>
            </div>

            {/* Doctor / Hospital Info */}
            {(doctorSpecialization || hospitalName) && (
                <div className="text-xs text-text-muted mb-4">
                    {doctorSpecialization && <span>{doctorSpecialization}</span>}
                    {doctorSpecialization && hospitalName && <span> • </span>}
                    {hospitalName && <span>{hospitalName}</span>}
                </div>
            )}

            {/* Medication Items */}
            {expanded && items.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <p className="text-sm font-semibold text-primary-dark flex items-center gap-2">
                        <Pill className="w-4 h-4 text-primary-action" />
                        Medications ({items.length})
                    </p>
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className="p-3 rounded-xl bg-background flex items-start gap-3"
                        >
                            <div className="w-2 h-2 rounded-full bg-primary-action mt-2 shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-primary-dark">
                                    {item.drugName}
                                </p>
                                <div className="flex flex-wrap gap-3 mt-1 text-xs text-text-muted">
                                    <span>{item.dosage}</span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {item.frequency}
                                    </span>
                                    <span>{item.duration}</span>
                                </div>
                                {item.instructions && (
                                    <p className="text-xs text-text-secondary mt-1 italic">
                                        {item.instructions}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Summary for collapsed view */}
            {!expanded && items.length > 0 && (
                <div className="flex items-center gap-2 mt-3 text-sm text-text-muted">
                    <Pill className="w-4 h-4" />
                    <span>
                        {items.length} medication{items.length > 1 ? "s" : ""} prescribed
                    </span>
                </div>
            )}

            {/* Prescription ID */}
            <div className="mt-4 pt-3 border-t border-border/50">
                <p className="text-xs text-text-muted font-mono">
                    Rx #{id.slice(0, 8).toUpperCase()}
                </p>
            </div>
        </div>
    );
}
