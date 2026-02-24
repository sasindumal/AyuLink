// ==============================================
// AyuLink - Patient Dashboard
// Digital Medical ID, QR Code, Prescription History Timeline
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import PrescriptionCard from "@/components/PrescriptionCard";
import {
    Activity,
    Calendar,
    ClipboardList,
    RefreshCw,
    FileText,
    Heart,
} from "lucide-react";

interface Prescription {
    id: string;
    diagnosis: string;
    status: "ACTIVE" | "DISPENSED";
    dateIssued: string;
    items: any[];
    doctor: {
        firstName: string;
        lastName: string;
        doctorProfile?: {
            specialization: string;
            hospitalName: string;
        };
    };
}

export default function PatientDashboard() {
    const { data: session } = useSession();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRx, setSelectedRx] = useState<string | null>(null);

    const user = session?.user;
    const fullName = user ? `${user.firstName} ${user.lastName}` : "Patient";

    useEffect(() => {
        fetchPrescriptions();
    }, []);

    const fetchPrescriptions = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/prescriptions");
            const data = await res.json();
            setPrescriptions(data.prescriptions || []);
        } catch (error) {
            console.error("Failed to fetch prescriptions:", error);
        } finally {
            setLoading(false);
        }
    };

    const activePrescriptions = prescriptions.filter(
        (p) => p.status === "ACTIVE"
    );
    const dispensedPrescriptions = prescriptions.filter(
        (p) => p.status === "DISPENSED"
    );

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
            {/* Welcome Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-primary-dark">
                        Welcome back, {user?.firstName} 👋
                    </h1>
                    <p className="text-text-muted mt-1">
                        Here&apos;s an overview of your digital health records
                    </p>
                </div>
                <button
                    onClick={fetchPrescriptions}
                    className="btn-secondary flex items-center gap-2 text-sm"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    {
                        label: "Active Prescriptions",
                        value: activePrescriptions.length,
                        icon: Activity,
                        color: "text-primary-action",
                        bg: "bg-primary-action/10",
                    },
                    {
                        label: "Total Prescriptions",
                        value: prescriptions.length,
                        icon: ClipboardList,
                        color: "text-primary-dark",
                        bg: "bg-primary-dark/10",
                    },
                    {
                        label: "Dispensed",
                        value: dispensedPrescriptions.length,
                        icon: Heart,
                        color: "text-accent-warning",
                        bg: "bg-accent-warning/10",
                    },
                ].map((stat) => (
                    <div
                        key={stat.label}
                        className="card p-6 flex items-center gap-4 animate-slide-up"
                    >
                        <div className={`p-3 rounded-xl ${stat.bg}`}>
                            <stat.icon className={`w-6 h-6 ${stat.color}`} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-primary-dark">
                                {stat.value}
                            </p>
                            <p className="text-sm text-text-muted">{stat.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Content: QR + Prescriptions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Digital Medical ID Card */}
                <div className="lg:col-span-1">
                    <h2 className="text-lg font-bold text-primary-dark mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary-action" />
                        Your Medical ID
                    </h2>
                    {user?.medicalId && (
                        <QRCodeDisplay
                            medicalId={user.medicalId}
                            patientName={fullName}
                            size={180}
                        />
                    )}

                    {/* Quick Info Card */}
                    <div className="card p-6 mt-6">
                        <h3 className="text-sm font-semibold text-primary-dark mb-4">
                            Personal Information
                        </h3>
                        <div className="space-y-3">
                            {[
                                { label: "NIC Number", value: user?.nicNumber || "" },
                                { label: "Full Name", value: fullName },
                                { label: "Role", value: "Patient" },
                            ].map((info) => (
                                <div key={info.label} className="flex justify-between text-sm">
                                    <span className="text-text-muted">{info.label}</span>
                                    <span className="font-medium text-primary-dark">
                                        {info.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Prescription History Timeline */}
                <div className="lg:col-span-2">
                    <h2 className="text-lg font-bold text-primary-dark mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary-action" />
                        Prescription History
                    </h2>

                    {loading ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="card p-6 animate-pulse"
                                >
                                    <div className="h-5 bg-border rounded w-1/3 mb-3" />
                                    <div className="h-4 bg-border rounded w-1/2 mb-2" />
                                    <div className="h-4 bg-border rounded w-1/4" />
                                </div>
                            ))}
                        </div>
                    ) : prescriptions.length === 0 ? (
                        <div className="card p-12 text-center">
                            <div className="w-16 h-16 mx-auto rounded-2xl bg-primary-action/10 flex items-center justify-center mb-4">
                                <ClipboardList className="w-8 h-8 text-primary-action" />
                            </div>
                            <h3 className="text-lg font-semibold text-primary-dark">
                                No prescriptions yet
                            </h3>
                            <p className="text-text-muted mt-2 max-w-xs mx-auto">
                                When a doctor issues you a digital prescription, it will appear
                                here in your timeline.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Active Prescriptions Section */}
                            {activePrescriptions.length > 0 && (
                                <div className="mb-6">
                                    <p className="text-sm font-semibold text-primary-action mb-3 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-primary-action animate-pulse-soft" />
                                        Active ({activePrescriptions.length})
                                    </p>
                                    <div className="space-y-4">
                                        {activePrescriptions.map((rx) => (
                                            <PrescriptionCard
                                                key={rx.id}
                                                id={rx.id}
                                                diagnosis={rx.diagnosis}
                                                status={rx.status}
                                                dateIssued={rx.dateIssued}
                                                doctorName={`${rx.doctor.firstName} ${rx.doctor.lastName}`}
                                                doctorSpecialization={
                                                    rx.doctor.doctorProfile?.specialization
                                                }
                                                hospitalName={rx.doctor.doctorProfile?.hospitalName}
                                                items={rx.items}
                                                expanded={selectedRx === rx.id}
                                                onClick={() =>
                                                    setSelectedRx(selectedRx === rx.id ? null : rx.id)
                                                }
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Dispensed Prescriptions Section */}
                            {dispensedPrescriptions.length > 0 && (
                                <div>
                                    <p className="text-sm font-semibold text-text-muted mb-3">
                                        Past Prescriptions ({dispensedPrescriptions.length})
                                    </p>
                                    <div className="space-y-4">
                                        {dispensedPrescriptions.map((rx) => (
                                            <PrescriptionCard
                                                key={rx.id}
                                                id={rx.id}
                                                diagnosis={rx.diagnosis}
                                                status={rx.status}
                                                dateIssued={rx.dateIssued}
                                                doctorName={`${rx.doctor.firstName} ${rx.doctor.lastName}`}
                                                doctorSpecialization={
                                                    rx.doctor.doctorProfile?.specialization
                                                }
                                                hospitalName={rx.doctor.doctorProfile?.hospitalName}
                                                items={rx.items}
                                                expanded={selectedRx === rx.id}
                                                onClick={() =>
                                                    setSelectedRx(selectedRx === rx.id ? null : rx.id)
                                                }
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
