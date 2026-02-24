// ==============================================
// AyuLink - Pharmacy Dashboard
// Scan Patient QR / Enter Prescription ID, View & Dispense
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
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
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PrescriptionDetail {
    id: string;
    diagnosis: string;
    status: "ACTIVE" | "DISPENSED";
    dateIssued: string;
    items: {
        id: string;
        drugName: string;
        dosage: string;
        frequency: string;
        duration: string;
        instructions: string;
    }[];
    patient: {
        firstName: string;
        lastName: string;
        nicNumber: string;
        medicalId: string;
        dob: string;
        mobileNumber: string;
    };
    doctor: {
        firstName: string;
        lastName: string;
        doctorProfile?: {
            specialization: string;
            hospitalName: string;
            slmcRegNo: string;
        };
    };
}

export default function PharmacyDashboard() {
    const { data: session } = useSession();
    const [showScanner, setShowScanner] = useState(false);
    const [prescriptions, setPrescriptions] = useState<PrescriptionDetail[]>([]);
    const [selectedRx, setSelectedRx] = useState<PrescriptionDetail | null>(null);
    const [searchId, setSearchId] = useState("");
    const [loading, setLoading] = useState(false);
    const [dispensing, setDispensing] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Handle QR scan — look up patient prescriptions
    const handleScan = async (medicalId: string) => {
        setShowScanner(false);
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            const res = await fetch(
                `/api/prescriptions?medicalId=${encodeURIComponent(medicalId)}`
            );
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to fetch prescriptions");
                return;
            }

            setPrescriptions(data.prescriptions || []);
            setSelectedRx(null);

            if (data.prescriptions?.length === 0) {
                setError("No prescriptions found for this patient");
            }
        } catch {
            setError("Failed to look up patient");
        } finally {
            setLoading(false);
        }
    };

    // Search prescription by ID
    const searchPrescription = async () => {
        if (!searchId.trim()) return;
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            const res = await fetch(`/api/prescriptions/${searchId.trim()}`);
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Prescription not found");
                setPrescriptions([]);
                return;
            }

            setPrescriptions([data.prescription]);
            setSelectedRx(data.prescription);
        } catch {
            setError("Failed to look up prescription");
        } finally {
            setLoading(false);
        }
    };

    // Mark prescription as dispensed
    const markAsDispensed = async (prescriptionId: string) => {
        setDispensing(true);
        setError("");

        try {
            const res = await fetch(`/api/prescriptions/${prescriptionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "DISPENSED" }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to update prescription");
                return;
            }

            // Update local state
            setPrescriptions((prev) =>
                prev.map((rx) =>
                    rx.id === prescriptionId ? { ...rx, status: "DISPENSED" as const } : rx
                )
            );
            if (selectedRx?.id === prescriptionId) {
                setSelectedRx({ ...selectedRx, status: "DISPENSED" });
            }

            setSuccess("Prescription marked as dispensed successfully!");
            setTimeout(() => setSuccess(""), 3000);
        } catch {
            setError("Failed to update prescription status");
        } finally {
            setDispensing(false);
        }
    };

    // Clear state
    const clearResults = () => {
        setPrescriptions([]);
        setSelectedRx(null);
        setError("");
        setSuccess("");
        setSearchId("");
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-primary-dark">
                    Pharmacy Dashboard 💊
                </h1>
                <p className="text-text-muted mt-1">
                    Scan prescriptions, verify medications, and dispense to patients
                </p>
            </div>

            {/* Success/Error Messages */}
            {success && (
                <div className="card p-4 border-l-4 border-l-primary-action bg-primary-action/5 animate-slide-up flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-primary-action" />
                    <span className="text-sm font-medium text-primary-dark">{success}</span>
                </div>
            )}
            {error && (
                <div className="card p-4 border-l-4 border-l-red-500 bg-red-50 animate-slide-up flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-sm font-medium text-red-600">{error}</span>
                </div>
            )}

            {/* Scan / Search Section */}
            <div className="card p-8 animate-slide-up">
                <h2 className="text-xl font-bold text-primary-dark mb-6 flex items-center gap-2">
                    <Search className="w-6 h-6 text-primary-action" />
                    Find Prescription
                </h2>

                <div className="flex flex-col sm:flex-row gap-4">
                    <button
                        onClick={() => setShowScanner(true)}
                        className="btn-primary flex items-center justify-center gap-3 flex-1 py-5 text-lg"
                    >
                        <ScanLine className="w-6 h-6" />
                        Scan Patient QR Code
                    </button>

                    <div className="flex items-center gap-2 text-text-muted text-sm">
                        <div className="h-px flex-1 bg-border" />
                        <span>or</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>

                    <div className="flex gap-2 flex-1">
                        <input
                            type="text"
                            value={searchId}
                            onChange={(e) => setSearchId(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && searchPrescription()}
                            placeholder="Enter Prescription ID"
                            className="input-field flex-1"
                        />
                        <button onClick={searchPrescription} className="btn-secondary">
                            Search
                        </button>
                    </div>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="card p-12 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-primary-action animate-spin" />
                </div>
            )}

            {/* Results */}
            {!loading && prescriptions.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Prescription List */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-primary-dark">
                                Prescriptions ({prescriptions.length})
                            </h2>
                            <button
                                onClick={clearResults}
                                className="text-sm text-text-muted hover:text-primary-dark"
                            >
                                Clear
                            </button>
                        </div>

                        {prescriptions.map((rx) => (
                            <div
                                key={rx.id}
                                onClick={() => setSelectedRx(rx)}
                                className={cn(
                                    "card p-4 cursor-pointer transition-all duration-200",
                                    selectedRx?.id === rx.id
                                        ? "ring-2 ring-primary-action shadow-md"
                                        : "hover:shadow-md",
                                    rx.status === "ACTIVE"
                                        ? "border-l-4 border-l-primary-action"
                                        : "border-l-4 border-l-text-muted/30"
                                )}
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-semibold text-primary-dark text-sm">
                                            {rx.diagnosis}
                                        </p>
                                        <p className="text-xs text-text-muted mt-1">
                                            {new Date(rx.dateIssued).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <span
                                        className={
                                            rx.status === "ACTIVE"
                                                ? "badge-active"
                                                : "badge-dispensed"
                                        }
                                    >
                                        {rx.status === "ACTIVE" ? "Active" : "Dispensed"}
                                    </span>
                                </div>
                                <p className="text-xs text-text-muted mt-2">
                                    {rx.items.length} medication{rx.items.length > 1 ? "s" : ""}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Right: Prescription Detail */}
                    <div className="lg:col-span-2">
                        {selectedRx ? (
                            <div className="card p-8 animate-slide-in-right">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-6">
                                    <div>
                                        <h3 className="text-2xl font-bold text-primary-dark">
                                            {selectedRx.diagnosis}
                                        </h3>
                                        <p className="text-sm text-text-muted font-mono mt-1">
                                            Rx #{selectedRx.id.slice(0, 8).toUpperCase()}
                                        </p>
                                    </div>
                                    <span
                                        className={cn(
                                            "text-base px-4 py-2",
                                            selectedRx.status === "ACTIVE"
                                                ? "badge-active"
                                                : "badge-dispensed"
                                        )}
                                    >
                                        {selectedRx.status === "ACTIVE" ? "⚡ Active" : "✓ Dispensed"}
                                    </span>
                                </div>

                                {/* Patient & Doctor Info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div className="p-4 rounded-xl bg-background">
                                        <p className="text-xs font-semibold text-text-muted mb-2 flex items-center gap-1">
                                            <User className="w-3 h-3" /> PATIENT
                                        </p>
                                        <p className="font-semibold text-primary-dark">
                                            {selectedRx.patient.firstName} {selectedRx.patient.lastName}
                                        </p>
                                        <p className="text-xs text-text-muted mt-1">
                                            NIC: {selectedRx.patient.nicNumber}
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-background">
                                        <p className="text-xs font-semibold text-text-muted mb-2 flex items-center gap-1">
                                            <Stethoscope className="w-3 h-3" /> PRESCRIBED BY
                                        </p>
                                        <p className="font-semibold text-primary-dark">
                                            Dr. {selectedRx.doctor.firstName} {selectedRx.doctor.lastName}
                                        </p>
                                        <p className="text-xs text-text-muted mt-1">
                                            {selectedRx.doctor.doctorProfile?.specialization} •{" "}
                                            {selectedRx.doctor.doctorProfile?.hospitalName}
                                        </p>
                                    </div>
                                </div>

                                {/* Date */}
                                <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
                                    <Calendar className="w-4 h-4" />
                                    <span>
                                        Issued on{" "}
                                        {new Date(selectedRx.dateIssued).toLocaleDateString(
                                            "en-US",
                                            {
                                                weekday: "long",
                                                year: "numeric",
                                                month: "long",
                                                day: "numeric",
                                            }
                                        )}
                                    </span>
                                </div>

                                {/* Medications */}
                                <div className="border-t border-border pt-6">
                                    <h4 className="text-sm font-bold text-primary-dark mb-4 flex items-center gap-2">
                                        <Pill className="w-4 h-4 text-primary-action" />
                                        Medications ({selectedRx.items.length})
                                    </h4>

                                    <div className="space-y-3">
                                        {selectedRx.items.map((item, index) => (
                                            <div
                                                key={item.id}
                                                className="p-4 rounded-xl bg-background border border-border flex items-start gap-4"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-primary-action/10 flex items-center justify-center text-sm font-bold text-primary-action shrink-0">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-semibold text-primary-dark">
                                                        {item.drugName}
                                                    </p>
                                                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-text-muted">
                                                        <span className="flex items-center gap-1 bg-surface px-2 py-1 rounded-lg">
                                                            <Package className="w-3 h-3" />
                                                            {item.dosage}
                                                        </span>
                                                        <span className="flex items-center gap-1 bg-surface px-2 py-1 rounded-lg">
                                                            <Clock className="w-3 h-3" />
                                                            {item.frequency}
                                                        </span>
                                                        {item.duration && (
                                                            <span className="bg-surface px-2 py-1 rounded-lg">
                                                                📅 {item.duration}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {item.instructions && (
                                                        <p className="text-xs text-text-secondary mt-2 italic">
                                                            💡 {item.instructions}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Dispense Button */}
                                {selectedRx.status === "ACTIVE" && (
                                    <div className="mt-8 flex justify-end">
                                        <button
                                            onClick={() => markAsDispensed(selectedRx.id)}
                                            disabled={dispensing}
                                            className="btn-primary flex items-center gap-3 text-base px-8 py-4 disabled:opacity-60"
                                        >
                                            {dispensing ? (
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                            ) : (
                                                <>
                                                    <CheckCircle className="w-5 h-5" />
                                                    Mark as Dispensed
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {selectedRx.status === "DISPENSED" && (
                                    <div className="mt-8 p-4 rounded-xl bg-primary-action/5 border border-primary-action/20 text-center">
                                        <CheckCircle className="w-8 h-8 text-primary-action mx-auto mb-2" />
                                        <p className="text-sm font-semibold text-primary-dark">
                                            This prescription has been dispensed
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="card p-12 text-center">
                                <Package className="w-12 h-12 text-text-muted/40 mx-auto mb-4" />
                                <p className="text-text-muted">
                                    Select a prescription from the list to view details
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* QR Scanner Modal */}
            <QRScanner
                isOpen={showScanner}
                onScan={handleScan}
                onClose={() => setShowScanner(false)}
            />
        </div>
    );
}
