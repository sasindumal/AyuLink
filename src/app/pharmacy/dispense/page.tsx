// ==============================================
// AyuLink - Pharmacy: Scan & Dispense Page
// QR Scanner + Prescription Lookup + Dispense
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
    patient: { firstName: string; lastName: string };
    doctor: {
        firstName: string;
        lastName: string;
        doctorProfile?: { specialization: string; hospitalName: string };
    };
}

export default function DispensePage() {
    const { data: session } = useSession();
    const [showScanner, setShowScanner] = useState(false);
    const [prescriptionId, setPrescriptionId] = useState("");
    const [prescription, setPrescription] = useState<PrescriptionDetail | null>(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [dispensing, setDispensing] = useState(false);
    const [dispensed, setDispensed] = useState(false);

    const searchPrescription = async (id: string) => {
        setSearchLoading(true);
        setSearchError("");
        setPrescription(null);
        setDispensed(false);

        try {
            const res = await fetch(`/api/prescriptions/${id}`);
            const data = await res.json();
            if (res.ok) {
                setPrescription(data.prescription);
            } else {
                setSearchError(data.error || "Prescription not found");
            }
        } catch {
            setSearchError("Failed to look up prescription");
        } finally {
            setSearchLoading(false);
        }
    };

    const handleScan = async (data: string) => {
        setShowScanner(false);
        // Scanned data could be a medical ID — look up patient prescriptions
        try {
            setSearchLoading(true);
            setSearchError("");
            setPrescription(null);

            const res = await fetch(`/api/patients/${data}`);
            const patientData = await res.json();
            if (res.ok && patientData.patient?.prescriptions?.length > 0) {
                // Find the first active prescription
                const activeRx = patientData.patient.prescriptions.find(
                    (rx: any) => rx.status === "ACTIVE"
                );
                if (activeRx) {
                    await searchPrescription(activeRx.id);
                    return;
                }
            }
            // If QR code is a prescription ID directly
            await searchPrescription(data);
        } catch {
            setSearchError("Failed to look up from QR code");
        } finally {
            setSearchLoading(false);
        }
    };

    const handleManualSearch = () => {
        if (prescriptionId.trim()) searchPrescription(prescriptionId.trim());
    };

    const handleDispense = async () => {
        if (!prescription || prescription.status !== "ACTIVE") return;

        setDispensing(true);
        try {
            const res = await fetch(`/api/prescriptions/${prescription.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "DISPENSED" }),
            });

            if (res.ok) {
                setDispensed(true);
                setPrescription((prev) =>
                    prev ? { ...prev, status: "DISPENSED" } : null
                );
            } else {
                const data = await res.json();
                setSearchError(data.error || "Failed to dispense");
            }
        } catch {
            setSearchError("Network error — please try again");
        } finally {
            setDispensing(false);
        }
    };

    const resetAll = () => {
        setPrescription(null);
        setPrescriptionId("");
        setSearchError("");
        setDispensed(false);
    };

    const formattedDate = prescription
        ? new Date(prescription.dateIssued).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        })
        : "";

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary-dark flex items-center gap-3">
                    Scan & Dispense
                    <Pill className="w-8 h-8 text-primary-action" />
                </h1>
                <p className="text-text-muted mt-1">
                    Scan a patient&apos;s QR code or search by prescription ID
                    to dispense medications
                </p>
            </div>

            {/* Dispensed Success Banner */}
            {dispensed && (
                <div className="mb-6 card p-4 flex items-center gap-3 bg-primary-action/5 border border-primary-action/20 animate-slide-up">
                    <CheckCircle className="w-6 h-6 text-primary-action" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-primary-dark">
                            Prescription dispensed successfully!
                        </p>
                        <p className="text-xs text-text-muted">
                            The patient has been notified
                        </p>
                    </div>
                    <button
                        onClick={resetAll}
                        className="text-sm text-primary-action font-medium hover:underline"
                    >
                        Scan Next
                    </button>
                </div>
            )}

            {/* Search Section */}
            {!prescription && (
                <div className="card p-8">
                    <h2 className="text-xl font-bold text-primary-dark mb-6 flex items-center gap-2">
                        <Search className="w-5 h-5 text-primary-action" />
                        Find Prescription
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
                                value={prescriptionId}
                                onChange={(e) => setPrescriptionId(e.target.value)}
                                placeholder="Enter Prescription ID"
                                className="input-field flex-1"
                                onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                            />
                            <button
                                onClick={handleManualSearch}
                                disabled={!prescriptionId.trim() || searchLoading}
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

                    {searchError && (
                        <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            <p className="text-sm text-red-600">{searchError}</p>
                        </div>
                    )}
                </div>
            )}

            {/* QR Scanner */}
            <QRScanner
                isOpen={showScanner}
                onScan={handleScan}
                onClose={() => setShowScanner(false)}
            />

            {/* Prescription Detail */}
            {prescription && (
                <div className="space-y-6 animate-slide-up">
                    {/* Header with change button */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-primary-dark">
                            Prescription Details
                        </h2>
                        <button
                            onClick={resetAll}
                            className="text-sm text-text-muted hover:text-primary-dark transition-colors"
                        >
                            Search Another
                        </button>
                    </div>

                    {/* Patient & Doctor Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="card p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <User className="w-4 h-4 text-primary-action" />
                                <h3 className="text-sm font-semibold text-primary-dark">
                                    Patient
                                </h3>
                            </div>
                            <p className="text-lg font-bold text-primary-dark">
                                {prescription.patient.firstName}{" "}
                                {prescription.patient.lastName}
                            </p>
                        </div>
                        <div className="card p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <Stethoscope className="w-4 h-4 text-primary-action" />
                                <h3 className="text-sm font-semibold text-primary-dark">
                                    Prescribing Doctor
                                </h3>
                            </div>
                            <p className="text-lg font-bold text-primary-dark">
                                Dr. {prescription.doctor.firstName}{" "}
                                {prescription.doctor.lastName}
                            </p>
                            {prescription.doctor.doctorProfile && (
                                <p className="text-xs text-text-muted mt-1">
                                    {prescription.doctor.doctorProfile.specialization}{" "}
                                    • {prescription.doctor.doctorProfile.hospitalName}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Prescription Card */}
                    <div className="card p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-primary-dark">
                                    {prescription.diagnosis}
                                </h3>
                                <div className="flex items-center gap-3 mt-2 text-sm text-text-muted">
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-4 h-4" />
                                        {formattedDate}
                                    </span>
                                    <span className="font-mono text-xs">
                                        Rx #{prescription.id.slice(0, 8).toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            <span
                                className={
                                    prescription.status === "ACTIVE"
                                        ? "badge-active"
                                        : "badge-dispensed"
                                }
                            >
                                {prescription.status === "ACTIVE" ? "Active" : "Dispensed"}
                            </span>
                        </div>

                        {/* Medications */}
                        <div className="mt-6 pt-4 border-t border-border">
                            <h4 className="text-sm font-semibold text-primary-dark mb-4 flex items-center gap-2">
                                <Package className="w-4 h-4 text-primary-action" />
                                Medications ({prescription.items.length})
                            </h4>
                            <div className="space-y-3">
                                {prescription.items.map((item) => (
                                    <div
                                        key={item.id}
                                        className="p-4 rounded-xl bg-background flex items-start gap-3"
                                    >
                                        <div className="w-2.5 h-2.5 rounded-full bg-primary-action mt-1.5 shrink-0" />
                                        <div className="flex-1">
                                            <p className="font-semibold text-primary-dark">
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
                        </div>

                        {/* Dispense Button */}
                        {prescription.status === "ACTIVE" && !dispensed && (
                            <button
                                onClick={handleDispense}
                                disabled={dispensing}
                                className="btn-primary w-full mt-6 flex items-center justify-center gap-2 py-4"
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
                        )}

                        {prescription.status === "DISPENSED" && (
                            <div className="mt-6 p-4 rounded-xl bg-text-muted/5 border border-border text-center">
                                <CheckCircle className="w-6 h-6 text-text-muted mx-auto mb-2" />
                                <p className="text-sm text-text-muted font-medium">
                                    This prescription has already been dispensed
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
