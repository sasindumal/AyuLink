// ==============================================
// AyuLink - Doctor: Scan Patient & Prescribe
// QR Scanner + Manual ID, Patient Lookup, Prescription Builder
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import QRScanner from "@/components/QRScanner";
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
    prescriptions: any[];
}

interface MedicationItem {
    drugName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
}

const emptyMedication: MedicationItem = {
    drugName: "",
    dosage: "",
    frequency: "",
    duration: "",
    instructions: "",
};

export default function ScanPatientPage() {
    const { data: session } = useSession();
    const [showScanner, setShowScanner] = useState(false);
    const [manualId, setManualId] = useState("");
    const [patient, setPatient] = useState<PatientInfo | null>(null);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState("");

    // Prescription builder state
    const [diagnosis, setDiagnosis] = useState("");
    const [medications, setMedications] = useState<MedicationItem[]>([
        { ...emptyMedication },
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [submitError, setSubmitError] = useState("");

    const lookupPatient = async (medicalId: string) => {
        setLookupLoading(true);
        setLookupError("");
        setPatient(null);
        setSubmitSuccess(false);
        setSubmitError("");

        try {
            const res = await fetch(`/api/patients/${medicalId}`);
            const data = await res.json();
            if (res.ok) {
                setPatient(data.patient);
            } else {
                setLookupError(data.error || "Patient not found");
            }
        } catch {
            setLookupError("Failed to look up patient");
        } finally {
            setLookupLoading(false);
        }
    };

    const handleScan = (data: string) => {
        setShowScanner(false);
        lookupPatient(data);
    };

    const handleManualLookup = () => {
        if (manualId.trim()) lookupPatient(manualId.trim());
    };

    const addMedication = () =>
        setMedications((prev) => [...prev, { ...emptyMedication }]);

    const removeMedication = (index: number) =>
        setMedications((prev) => prev.filter((_, i) => i !== index));

    const updateMedication = (
        index: number,
        field: keyof MedicationItem,
        value: string
    ) => {
        setMedications((prev) =>
            prev.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        );
    };

    const handleSubmit = async () => {
        if (!patient || !diagnosis.trim()) return;

        const validMeds = medications.filter(
            (m) => m.drugName && m.dosage && m.frequency && m.duration
        );
        if (validMeds.length === 0) {
            setSubmitError("Add at least one complete medication");
            return;
        }

        setIsSubmitting(true);
        setSubmitError("");

        try {
            const res = await fetch("/api/prescriptions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patientId: patient.id,
                    diagnosis,
                    items: validMeds,
                }),
            });

            if (res.ok) {
                setSubmitSuccess(true);
                setDiagnosis("");
                setMedications([{ ...emptyMedication }]);
                // Re-fetch patient to show updated prescriptions
                lookupPatient(patient.medicalId);
            } else {
                const data = await res.json();
                setSubmitError(data.error || "Failed to issue prescription");
            }
        } catch {
            setSubmitError("Network error — please try again");
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetAll = () => {
        setPatient(null);
        setDiagnosis("");
        setMedications([{ ...emptyMedication }]);
        setManualId("");
        setSubmitSuccess(false);
        setSubmitError("");
        setLookupError("");
    };

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary-dark flex items-center gap-3">
                    Scan & Prescribe
                    <ScanLine className="w-8 h-8 text-primary-action" />
                </h1>
                <p className="text-text-muted mt-1">
                    Scan a patient&apos;s QR code or enter their Medical ID to
                    write a digital prescription
                </p>
            </div>

            {/* Success Banner */}
            {submitSuccess && (
                <div className="mb-6 card p-4 flex items-center gap-3 bg-primary-action/5 border border-primary-action/20 animate-slide-up">
                    <CheckCircle className="w-6 h-6 text-primary-action" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-primary-dark">
                            Prescription issued successfully!
                        </p>
                        <p className="text-xs text-text-muted">
                            The patient can now view it in their dashboard
                        </p>
                    </div>
                    <button
                        onClick={() => setSubmitSuccess(false)}
                        className="p-1 hover:bg-background rounded-lg"
                    >
                        <X className="w-4 h-4 text-text-muted" />
                    </button>
                </div>
            )}

            {/* Patient Identification */}
            {!patient && (
                <div className="card p-8">
                    <h2 className="text-xl font-bold text-primary-dark mb-6 flex items-center gap-2">
                        <ScanLine className="w-5 h-5 text-primary-action" />
                        Identify Patient
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
                                value={manualId}
                                onChange={(e) => setManualId(e.target.value)}
                                placeholder="Enter Medical ID manually"
                                className="input-field flex-1"
                                onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
                            />
                            <button
                                onClick={handleManualLookup}
                                disabled={!manualId.trim() || lookupLoading}
                                className="btn-secondary px-6"
                            >
                                {lookupLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    "Look Up"
                                )}
                            </button>
                        </div>
                    </div>

                    {lookupError && (
                        <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            <p className="text-sm text-red-600">{lookupError}</p>
                        </div>
                    )}
                </div>
            )}

            {/* QR Scanner Modal */}
            <QRScanner
                isOpen={showScanner}
                onScan={handleScan}
                onClose={() => setShowScanner(false)}
            />

            {/* Patient Found — Info + Prescription Builder */}
            {patient && (
                <div className="space-y-6 animate-slide-up">
                    {/* Patient Info Card */}
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
                                Change Patient
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
                                <p className="text-xs text-text-muted">
                                    Active Prescriptions
                                </p>
                                <p className="text-sm font-semibold text-primary-action">
                                    {patient.prescriptions?.filter(
                                        (p: any) => p.status === "ACTIVE"
                                    ).length || 0}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Prescription Builder */}
                    <div className="card p-6">
                        <h2 className="text-lg font-bold text-primary-dark mb-6 flex items-center gap-2">
                            <Stethoscope className="w-5 h-5 text-primary-action" />
                            New Prescription
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
                                className="input-field"
                            />
                        </div>

                        {/* Medications */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <label className="text-sm font-semibold text-primary-dark flex items-center gap-2">
                                    <Pill className="w-4 h-4 text-primary-action" />
                                    Medications ({medications.length})
                                </label>
                                <button
                                    onClick={addMedication}
                                    className="flex items-center gap-1 text-sm text-primary-action hover:text-primary-action-hover font-medium"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Medication
                                </button>
                            </div>

                            <div className="space-y-4">
                                {medications.map((med, index) => (
                                    <div
                                        key={index}
                                        className="p-4 rounded-xl bg-background border border-border relative"
                                    >
                                        {medications.length > 1 && (
                                            <button
                                                onClick={() => removeMedication(index)}
                                                className="absolute top-3 right-3 p-1 rounded-lg hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}

                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <input
                                                type="text"
                                                value={med.drugName}
                                                onChange={(e) =>
                                                    updateMedication(index, "drugName", e.target.value)
                                                }
                                                placeholder="Drug name *"
                                                className="input-field text-sm"
                                            />
                                            <input
                                                type="text"
                                                value={med.dosage}
                                                onChange={(e) =>
                                                    updateMedication(index, "dosage", e.target.value)
                                                }
                                                placeholder="Dosage *"
                                                className="input-field text-sm"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <input
                                                type="text"
                                                value={med.frequency}
                                                onChange={(e) =>
                                                    updateMedication(index, "frequency", e.target.value)
                                                }
                                                placeholder="Frequency *"
                                                className="input-field text-sm"
                                            />
                                            <input
                                                type="text"
                                                value={med.duration}
                                                onChange={(e) =>
                                                    updateMedication(index, "duration", e.target.value)
                                                }
                                                placeholder="Duration *"
                                                className="input-field text-sm"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            value={med.instructions}
                                            onChange={(e) =>
                                                updateMedication(index, "instructions", e.target.value)
                                            }
                                            placeholder="Special instructions (optional)"
                                            className="input-field text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Error */}
                        {submitError && (
                            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500" />
                                <p className="text-sm text-red-600">{submitError}</p>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !diagnosis.trim()}
                            className="btn-primary w-full flex items-center justify-center gap-2 py-4 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <Send className="w-5 h-5" />
                                    Sign & Issue Digital Prescription
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
