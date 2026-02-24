// ==============================================
// AyuLink - Doctor Dashboard
// QR Scanner, Dynamic Prescription Builder, Issue Digital Chit
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import QRScanner from "@/components/QRScanner";
import PrescriptionCard from "@/components/PrescriptionCard";
import {
    ScanLine,
    Plus,
    Trash2,
    Send,
    User,
    Stethoscope,
    Pill,
    CheckCircle,
    X,
    AlertCircle,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PatientInfo {
    id: string;
    firstName: string;
    lastName: string;
    nicNumber: string;
    medicalId: string;
    dob: string;
    mobileNumber: string;
    prescriptionsAsPatient: any[];
}

interface PrescriptionItem {
    drugName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
}

const emptyItem: PrescriptionItem = {
    drugName: "",
    dosage: "",
    frequency: "",
    duration: "",
    instructions: "",
};

const frequencyOptions = [
    "Once daily",
    "Twice daily",
    "Three times daily",
    "Four times daily",
    "Every 4 hours",
    "Every 6 hours",
    "Every 8 hours",
    "Every 12 hours",
    "As needed",
    "Before meals",
    "After meals",
    "At bedtime",
];

export default function DoctorDashboard() {
    const { data: session } = useSession();
    const [showScanner, setShowScanner] = useState(false);
    const [patient, setPatient] = useState<PatientInfo | null>(null);
    const [diagnosis, setDiagnosis] = useState("");
    const [items, setItems] = useState<PrescriptionItem[]>([{ ...emptyItem }]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");
    const [manualId, setManualId] = useState("");

    // Handle QR scan result
    const handleScan = async (medicalId: string) => {
        setShowScanner(false);
        await lookupPatient(medicalId);
    };

    // Look up patient by medical ID
    const lookupPatient = async (medicalId: string) => {
        try {
            setError("");
            const res = await fetch(`/api/patients/${medicalId}`);
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Patient not found");
                return;
            }

            setPatient(data.patient);
        } catch {
            setError("Failed to look up patient");
        }
    };

    // Add new prescription item
    const addItem = () => {
        setItems((prev) => [...prev, { ...emptyItem }]);
    };

    // Remove a prescription item
    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems((prev) => prev.filter((_, i) => i !== index));
        }
    };

    // Update a prescription item field
    const updateItem = (
        index: number,
        field: keyof PrescriptionItem,
        value: string
    ) => {
        setItems((prev) =>
            prev.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        );
    };

    // Submit the prescription
    const handleSubmit = async () => {
        if (!patient) {
            setError("Please scan a patient first");
            return;
        }
        if (!diagnosis.trim()) {
            setError("Please enter a diagnosis");
            return;
        }
        if (items.some((item) => !item.drugName || !item.dosage || !item.frequency)) {
            setError("Please fill in all required medication fields");
            return;
        }

        setIsSubmitting(true);
        setError("");

        try {
            const res = await fetch("/api/prescriptions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patientId: patient.id,
                    diagnosis,
                    items,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to issue prescription");
                return;
            }

            setSuccess(true);
            // Reset form after 3 seconds
            setTimeout(() => {
                setSuccess(false);
                setPatient(null);
                setDiagnosis("");
                setItems([{ ...emptyItem }]);
            }, 3000);
        } catch {
            setError("An error occurred while issuing the prescription");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Clear patient and form
    const clearPatient = () => {
        setPatient(null);
        setDiagnosis("");
        setItems([{ ...emptyItem }]);
        setError("");
    };

    const userName = session?.user
        ? `Dr. ${session.user.firstName} ${session.user.lastName}`
        : "Doctor";

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-primary-dark">
                    Good{" "}
                    {new Date().getHours() < 12
                        ? "morning"
                        : new Date().getHours() < 17
                            ? "afternoon"
                            : "evening"}
                    , {userName} 🩺
                </h1>
                <p className="text-text-muted mt-1">
                    Scan a patient&apos;s QR code to start writing a prescription
                </p>
            </div>

            {/* Success Message */}
            {success && (
                <div className="card p-6 border-l-4 border-l-primary-action bg-primary-action/5 animate-slide-up flex items-center gap-4">
                    <CheckCircle className="w-8 h-8 text-primary-action" />
                    <div>
                        <h3 className="font-bold text-primary-dark">
                            Prescription Issued Successfully!
                        </h3>
                        <p className="text-sm text-text-muted mt-1">
                            The digital prescription has been sent to the patient&apos;s
                            records.
                        </p>
                    </div>
                </div>
            )}

            {/* Step 1: Scan Patient or Enter ID */}
            {!patient && !success && (
                <div className="card p-8 animate-slide-up">
                    <h2 className="text-xl font-bold text-primary-dark mb-6 flex items-center gap-2">
                        <ScanLine className="w-6 h-6 text-primary-action" />
                        Identify Patient
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
                                value={manualId}
                                onChange={(e) => setManualId(e.target.value)}
                                placeholder="Enter Medical ID manually"
                                className="input-field flex-1"
                            />
                            <button
                                onClick={() => manualId && lookupPatient(manualId)}
                                className="btn-secondary"
                            >
                                Look Up
                            </button>
                        </div>
                    </div>

                    {error && !patient && (
                        <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}
                </div>
            )}

            {/* Step 2: Patient Info + Prescription Builder */}
            {patient && !success && (
                <div className="space-y-6">
                    {/* Patient Info Card */}
                    <div className="card p-6 border-l-4 border-l-primary-action animate-slide-up">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-primary-action/10 flex items-center justify-center">
                                    <User className="w-7 h-7 text-primary-action" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-primary-dark">
                                        {patient.firstName} {patient.lastName}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-text-muted">
                                        <span>NIC: {patient.nicNumber}</span>
                                        <span>•</span>
                                        <span>
                                            DOB:{" "}
                                            {new Date(patient.dob).toLocaleDateString("en-US", {
                                                year: "numeric",
                                                month: "short",
                                                day: "numeric",
                                            })}
                                        </span>
                                        <span>•</span>
                                        <span>📱 {patient.mobileNumber}</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={clearPatient}
                                className="p-2 rounded-lg hover:bg-background text-text-muted"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Previous Prescriptions Count */}
                        {patient.prescriptionsAsPatient?.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-border">
                                <p className="text-sm text-text-muted">
                                    📋 {patient.prescriptionsAsPatient.length} previous
                                    prescription
                                    {patient.prescriptionsAsPatient.length > 1 ? "s" : ""} on
                                    record
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Prescription Builder */}
                    <div className="card p-8 animate-slide-up">
                        <h2 className="text-xl font-bold text-primary-dark mb-6 flex items-center gap-2">
                            <Stethoscope className="w-6 h-6 text-primary-action" />
                            Prescription Builder
                        </h2>

                        {/* Diagnosis */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-primary-dark mb-2">
                                Diagnosis / Condition
                            </label>
                            <input
                                type="text"
                                value={diagnosis}
                                onChange={(e) => setDiagnosis(e.target.value)}
                                placeholder="e.g., Upper Respiratory Tract Infection"
                                className="input-field text-lg"
                            />
                        </div>

                        {/* Medication Items */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-primary-dark flex items-center gap-2">
                                    <Pill className="w-4 h-4 text-primary-action" />
                                    Medications
                                </h3>
                                <button
                                    type="button"
                                    onClick={addItem}
                                    className="text-sm font-semibold text-primary-action hover:text-primary-action-hover flex items-center gap-1 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Medication
                                </button>
                            </div>

                            {items.map((item, index) => (
                                <div
                                    key={index}
                                    className="p-5 rounded-2xl bg-background border border-border animate-slide-in-right"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-sm font-semibold text-primary-dark">
                                            Medication #{index + 1}
                                        </span>
                                        {items.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeItem(index)}
                                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-medium text-text-muted mb-1">
                                                Drug Name *
                                            </label>
                                            <input
                                                type="text"
                                                value={item.drugName}
                                                onChange={(e) =>
                                                    updateItem(index, "drugName", e.target.value)
                                                }
                                                placeholder="e.g., Amoxicillin 500mg"
                                                className="input-field"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-text-muted mb-1">
                                                Dosage *
                                            </label>
                                            <input
                                                type="text"
                                                value={item.dosage}
                                                onChange={(e) =>
                                                    updateItem(index, "dosage", e.target.value)
                                                }
                                                placeholder="e.g., 1 tablet"
                                                className="input-field"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-text-muted mb-1">
                                                Frequency *
                                            </label>
                                            <select
                                                value={item.frequency}
                                                onChange={(e) =>
                                                    updateItem(index, "frequency", e.target.value)
                                                }
                                                className="input-field"
                                            >
                                                <option value="">Select frequency</option>
                                                {frequencyOptions.map((freq) => (
                                                    <option key={freq} value={freq}>
                                                        {freq}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-text-muted mb-1">
                                                Duration
                                            </label>
                                            <input
                                                type="text"
                                                value={item.duration}
                                                onChange={(e) =>
                                                    updateItem(index, "duration", e.target.value)
                                                }
                                                placeholder="e.g., 5 days"
                                                className="input-field"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-text-muted mb-1">
                                                Special Instructions
                                            </label>
                                            <input
                                                type="text"
                                                value={item.instructions}
                                                onChange={(e) =>
                                                    updateItem(index, "instructions", e.target.value)
                                                }
                                                placeholder="e.g., Take with food"
                                                className="input-field"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Error */}
                        {error && patient && (
                            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <div className="mt-8 flex justify-end">
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="btn-primary flex items-center gap-3 text-base px-8 py-4 disabled:opacity-60"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <Send className="w-5 h-5" />
                                        Sign & Issue Digital Chit
                                    </>
                                )}
                            </button>
                        </div>
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
