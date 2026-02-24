// ==============================================
// AyuLink - Pharmacy: Scan & Dispense Page
// Scan patient Medical ID → show prescriptions → dispense per medicine
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useState, useCallback } from "react";
import QRScanner from "@/components/QRScanner";
import {
    ScanLine,
    Pill,
    CheckCircle,
    AlertCircle,
    User,
    Calendar,
    Stethoscope,
    Clock,
    Search,
    Package,
    Loader2,
    Undo2,
    ChevronDown,
    ChevronUp,
    Activity,
    Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PrescriptionItem {
    id: string;
    drugName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
    dispensed: boolean;
    dispensedAt: string | null;
    dispensedBy?: {
        firstName: string;
        lastName: string;
        pharmacyProfile?: {
            pharmacyName: string;
            licenseNumber: string;
        };
    } | null;
}

interface PrescriptionDetail {
    id: string;
    diagnosis: string;
    status: "NOT_DISPENSED" | "PARTIALLY_DISPENSED" | "FULLY_DISPENSED";
    dateIssued: string;
    items: PrescriptionItem[];
    doctor: {
        firstName: string;
        lastName: string;
        doctorProfile?: { specialization: string; hospitalName: string };
    };
}

interface PatientInfo {
    id: string;
    firstName: string;
    lastName: string;
    nicNumber: string;
    medicalId: string;
    prescriptionsAsPatient: PrescriptionDetail[];
}

export default function DispensePage() {
    const { data: session } = useSession();
    const [showScanner, setShowScanner] = useState(false);
    const [medicalId, setMedicalId] = useState("");
    const [patient, setPatient] = useState<PatientInfo | null>(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [expandedRx, setExpandedRx] = useState<Set<string>>(new Set());

    // Track dispensed-in-this-session items for revert eligibility
    const [sessionDispensed, setSessionDispensed] = useState<Set<string>>(new Set());
    const [dispensingItem, setDispensingItem] = useState<string | null>(null);

    const lookupPatient = useCallback(async (id: string) => {
        setSearchLoading(true);
        setSearchError("");
        setPatient(null);
        setExpandedRx(new Set());
        setSessionDispensed(new Set());

        try {
            const res = await fetch(`/api/patients/${id}`);
            const data = await res.json();
            if (res.ok && data.patient) {
                setPatient(data.patient);
                // Auto-expand all active prescriptions
                const activeIds = new Set<string>(
                    data.patient.prescriptionsAsPatient
                        ?.filter((rx: PrescriptionDetail) => rx.status !== "FULLY_DISPENSED")
                        .map((rx: PrescriptionDetail) => rx.id) || []
                );
                setExpandedRx(activeIds);
            } else {
                setSearchError(data.error || "Patient not found");
            }
        } catch {
            setSearchError("Failed to look up patient");
        } finally {
            setSearchLoading(false);
        }
    }, []);

    const handleScan = (data: string) => {
        setShowScanner(false);
        lookupPatient(data);
    };

    const handleManualSearch = () => {
        if (medicalId.trim()) lookupPatient(medicalId.trim());
    };

    const toggleExpand = (rxId: string) => {
        setExpandedRx((prev) => {
            const next = new Set(prev);
            if (next.has(rxId)) next.delete(rxId);
            else next.add(rxId);
            return next;
        });
    };

    const dispenseItem = async (prescriptionId: string, itemId: string, dispense: boolean) => {
        setDispensingItem(itemId);
        try {
            const res = await fetch(`/api/prescriptions/${prescriptionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemId, dispensed: dispense }),
            });
            const data = await res.json();

            if (res.ok && data.prescription) {
                // Update the patient's prescriptions in place
                setPatient((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        prescriptionsAsPatient: prev.prescriptionsAsPatient.map((rx) =>
                            rx.id === prescriptionId ? data.prescription : rx
                        ),
                    };
                });

                // Track session dispensing for revert eligibility
                if (dispense) {
                    setSessionDispensed((prev) => new Set(prev).add(itemId));
                } else {
                    setSessionDispensed((prev) => {
                        const next = new Set(prev);
                        next.delete(itemId);
                        return next;
                    });
                }
            } else {
                setSearchError(data.error || "Failed to update item");
                setTimeout(() => setSearchError(""), 4000);
            }
        } catch {
            setSearchError("Network error — please try again");
            setTimeout(() => setSearchError(""), 4000);
        } finally {
            setDispensingItem(null);
        }
    };

    const canRevert = (item: PrescriptionItem): boolean => {
        if (!item.dispensed || !item.dispensedAt) return false;
        // Must have been dispensed in this session
        if (!sessionDispensed.has(item.id)) return false;
        // Must be within 15 minutes
        const dispensedTime = new Date(item.dispensedAt).getTime();
        const fifteenMinutes = 15 * 60 * 1000;
        return Date.now() - dispensedTime < fifteenMinutes;
    };

    const resetAll = () => {
        setPatient(null);
        setMedicalId("");
        setSearchError("");
        setExpandedRx(new Set());
        setSessionDispensed(new Set());
    };

    const formatDate = (dateStr: string) =>
        new Date(dateStr).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });

    const formatTime = (dateStr: string) =>
        new Date(dateStr).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
        });

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary-dark flex items-center gap-3">
                    Scan & Dispense
                    <Pill className="w-8 h-8 text-primary-action" />
                </h1>
                <p className="text-text-muted mt-1">
                    Scan a patient&apos;s Medical ID to view and dispense their
                    medications one by one
                </p>
            </div>

            {/* Error Banner */}
            {searchError && (
                <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 animate-slide-up">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-sm text-red-600">{searchError}</p>
                </div>
            )}

            {/* Search Section */}
            {!patient && (
                <div className="card p-8">
                    <h2 className="text-xl font-bold text-primary-dark mb-6 flex items-center gap-2">
                        <Search className="w-5 h-5 text-primary-action" />
                        Find Patient
                    </h2>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowScanner(true)}
                            className="btn-primary flex items-center gap-2 flex-1 justify-center py-4"
                        >
                            <ScanLine className="w-5 h-5" />
                            Scan Patient QR Code
                        </button>
                        <span className="text-text-muted text-sm">or</span>
                        <div className="flex gap-2 flex-1">
                            <input
                                type="text"
                                value={medicalId}
                                onChange={(e) => setMedicalId(e.target.value)}
                                placeholder="Enter Medical ID"
                                className="input-field flex-1"
                                onKeyDown={(e) =>
                                    e.key === "Enter" && handleManualSearch()
                                }
                            />
                            <button
                                onClick={handleManualSearch}
                                disabled={!medicalId.trim() || searchLoading}
                                className="btn-secondary px-6"
                            >
                                {searchLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    "Search"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <QRScanner
                isOpen={showScanner}
                onScan={handleScan}
                onClose={() => setShowScanner(false)}
            />

            {/* Patient Found */}
            {patient && (
                <div className="space-y-6 animate-slide-up">
                    {/* Patient Info */}
                    <div className="card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-primary-dark flex items-center gap-2">
                                <User className="w-5 h-5 text-primary-action" />
                                Patient Information
                            </h2>
                            <button
                                onClick={resetAll}
                                className="text-sm text-text-muted hover:text-primary-dark transition-colors"
                            >
                                Search Another
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <p className="text-xs text-text-muted">Name</p>
                                <p className="text-sm font-semibold text-primary-dark">
                                    {patient.firstName} {patient.lastName}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-text-muted">NIC</p>
                                <p className="text-sm font-medium text-primary-dark">
                                    {patient.nicNumber}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-text-muted">Medical ID</p>
                                <p className="text-sm font-mono font-medium text-primary-dark">
                                    {patient.medicalId}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Prescriptions List */}
                    <div>
                        <h2 className="text-lg font-bold text-primary-dark mb-4 flex items-center gap-2">
                            <Package className="w-5 h-5 text-primary-action" />
                            Prescriptions ({patient.prescriptionsAsPatient.length})
                        </h2>

                        {patient.prescriptionsAsPatient.length === 0 ? (
                            <div className="card p-10 text-center">
                                <Package className="w-10 h-10 text-text-muted mx-auto mb-3" />
                                <p className="text-text-muted">
                                    No prescriptions found for this patient
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {patient.prescriptionsAsPatient.map((rx) => {
                                    const isExpanded = expandedRx.has(rx.id);
                                    const dispensedCount = rx.items.filter(
                                        (i) => i.dispensed
                                    ).length;
                                    const totalCount = rx.items.length;
                                    const allDone = dispensedCount === totalCount;

                                    return (
                                        <div
                                            key={rx.id}
                                            className={cn(
                                                "card overflow-hidden transition-all",
                                                allDone && "opacity-75"
                                            )}
                                        >
                                            {/* Prescription Header */}
                                            <button
                                                onClick={() => toggleExpand(rx.id)}
                                                className="w-full p-5 flex items-start justify-between text-left hover:bg-background/50 transition-colors"
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <h3 className="text-lg font-bold text-primary-dark">
                                                            {rx.diagnosis}
                                                        </h3>
                                                        <span
                                                            className={
                                                                allDone
                                                                    ? "badge-dispensed"
                                                                    : "badge-active"
                                                            }
                                                        >
                                                            {allDone
                                                                ? "Fully Dispensed"
                                                                : `${dispensedCount}/${totalCount} dispensed`}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-sm text-text-muted">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-3.5 h-3.5" />
                                                            {formatDate(rx.dateIssued)}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Stethoscope className="w-3.5 h-3.5" />
                                                            Dr. {rx.doctor.firstName}{" "}
                                                            {rx.doctor.lastName}
                                                        </span>
                                                        {rx.doctor.doctorProfile && (
                                                            <span className="text-xs">
                                                                {rx.doctor.doctorProfile.specialization}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {isExpanded ? (
                                                    <ChevronUp className="w-5 h-5 text-text-muted mt-1" />
                                                ) : (
                                                    <ChevronDown className="w-5 h-5 text-text-muted mt-1" />
                                                )}
                                            </button>

                                            {/* Expanded: Medications */}
                                            {isExpanded && (
                                                <div className="px-5 pb-5 pt-0 border-t border-border">
                                                    <div className="pt-4 space-y-3">
                                                        {rx.items.map((item) => (
                                                            <div
                                                                key={item.id}
                                                                className={cn(
                                                                    "p-4 rounded-xl flex items-start gap-3 transition-all",
                                                                    item.dispensed
                                                                        ? "bg-primary-action/5 border border-primary-action/20"
                                                                        : "bg-background border border-border"
                                                                )}
                                                            >
                                                                {/* Drug Info */}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <div
                                                                            className={cn(
                                                                                "w-2.5 h-2.5 rounded-full shrink-0",
                                                                                item.dispensed
                                                                                    ? "bg-primary-action"
                                                                                    : "bg-accent-warning"
                                                                            )}
                                                                        />
                                                                        <p className="font-semibold text-primary-dark">
                                                                            {item.drugName}
                                                                        </p>
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-3 text-xs text-text-muted ml-4.5 pl-0.5">
                                                                        <span>{item.dosage}</span>
                                                                        <span className="flex items-center gap-1">
                                                                            <Clock className="w-3 h-3" />
                                                                            {item.frequency}
                                                                        </span>
                                                                        <span>{item.duration}</span>
                                                                    </div>
                                                                    {item.instructions && (
                                                                        <p className="text-xs text-text-secondary mt-1 italic ml-4.5 pl-0.5">
                                                                            {item.instructions}
                                                                        </p>
                                                                    )}
                                                                    {item.dispensed && item.dispensedAt && (
                                                                        <div className="mt-1.5 ml-4.5 pl-0.5 space-y-0.5">
                                                                            <p className="text-xs text-primary-action flex items-center gap-1">
                                                                                <CheckCircle className="w-3 h-3" />
                                                                                Dispensed at{" "}
                                                                                {formatTime(item.dispensedAt)}
                                                                            </p>
                                                                            {item.dispensedBy?.pharmacyProfile && (
                                                                                <p className="text-xs text-text-muted flex items-center gap-1">
                                                                                    <Building2 className="w-3 h-3" />
                                                                                    {item.dispensedBy.pharmacyProfile.pharmacyName}
                                                                                    <span className="opacity-60">·</span>
                                                                                    <span className="font-mono text-[10px]">
                                                                                        {item.dispensedBy.pharmacyProfile.licenseNumber}
                                                                                    </span>
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Action Button */}
                                                                <div className="shrink-0 flex items-center gap-2">
                                                                    {item.dispensed ? (
                                                                        <>
                                                                            <span className="text-xs text-primary-action font-medium flex items-center gap-1">
                                                                                <CheckCircle className="w-4 h-4" />
                                                                                Done
                                                                            </span>
                                                                            {canRevert(item) && (
                                                                                <button
                                                                                    onClick={() =>
                                                                                        dispenseItem(
                                                                                            rx.id,
                                                                                            item.id,
                                                                                            false
                                                                                        )
                                                                                    }
                                                                                    disabled={
                                                                                        dispensingItem === item.id
                                                                                    }
                                                                                    className="flex items-center gap-1 text-xs text-text-muted hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                                                                                    title="Undo dispense (within 15 min)"
                                                                                >
                                                                                    {dispensingItem === item.id ? (
                                                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                                    ) : (
                                                                                        <Undo2 className="w-3.5 h-3.5" />
                                                                                    )}
                                                                                    Undo
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() =>
                                                                                dispenseItem(
                                                                                    rx.id,
                                                                                    item.id,
                                                                                    true
                                                                                )
                                                                            }
                                                                            disabled={
                                                                                dispensingItem === item.id
                                                                            }
                                                                            className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
                                                                        >
                                                                            {dispensingItem === item.id ? (
                                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                            ) : (
                                                                                <Pill className="w-4 h-4" />
                                                                            )}
                                                                            Dispense
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Progress bar */}
                                                    <div className="mt-4 pt-3 border-t border-border/50">
                                                        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                                                            <span>Dispensing Progress</span>
                                                            <span className="font-medium">
                                                                {dispensedCount}/{totalCount}
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-2 rounded-full bg-background overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full bg-primary-action transition-all duration-500"
                                                                style={{
                                                                    width: `${(dispensedCount / totalCount) * 100}%`,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
