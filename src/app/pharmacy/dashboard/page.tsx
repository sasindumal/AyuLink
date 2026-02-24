// ==============================================
// AyuLink - Pharmacy Dashboard
// Overview with stats, quick actions, recent activity
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import PrescriptionCard from "@/components/PrescriptionCard";
import {
    Pill,
    ScanLine,
    ClipboardList,
    Activity,
    CheckCircle,
    Package,
    Clock,
    ArrowRight,
    Loader2,
} from "lucide-react";

interface Prescription {
    id: string;
    diagnosis: string;
    status: "ACTIVE" | "DISPENSED";
    dateIssued: string;
    items: any[];
    patient: { firstName: string; lastName: string };
    doctor: {
        firstName: string;
        lastName: string;
        doctorProfile?: { specialization: string; hospitalName: string };
    };
}

export default function PharmacyDashboard() {
    const { data: session } = useSession();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [loading, setLoading] = useState(true);

    const userName = session?.user
        ? `${session.user.firstName} ${session.user.lastName}`
        : "Pharmacist";

    useEffect(() => {
        const fetchPrescriptions = async () => {
            try {
                const res = await fetch("/api/prescriptions");
                const data = await res.json();
                setPrescriptions(data.prescriptions || []);
            } catch (err) {
                console.error("Failed to fetch:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchPrescriptions();
    }, []);

    const activeCount = prescriptions.filter((rx) => rx.status === "ACTIVE").length;
    const dispensedCount = prescriptions.filter((rx) => rx.status === "DISPENSED").length;
    const totalMeds = prescriptions
        .filter((rx) => rx.status === "DISPENSED")
        .reduce((sum, rx) => sum + rx.items.length, 0);
    const recentPrescriptions = prescriptions.slice(0, 5);

    return (
        <div className="max-w-5xl mx-auto animate-fade-in">
            {/* Greeting */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary-dark">
                    Pharmacy Dashboard 💊
                </h1>
                <p className="text-text-muted mt-1">
                    Scan prescriptions, verify medications, and dispense to patients
                </p>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="card p-5 flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-primary-action/10">
                        <ClipboardList className="w-6 h-6 text-primary-action" />
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-primary-dark">{prescriptions.length}</p>
                        <p className="text-sm text-text-muted">Total</p>
                    </div>
                </div>
                <div className="card p-5 flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-accent-warning/10">
                        <Activity className="w-6 h-6 text-accent-warning" />
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-primary-dark">{activeCount}</p>
                        <p className="text-sm text-text-muted">Pending</p>
                    </div>
                </div>
                <div className="card p-5 flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-primary-action/10">
                        <CheckCircle className="w-6 h-6 text-primary-action" />
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-primary-dark">{dispensedCount}</p>
                        <p className="text-sm text-text-muted">Dispensed</p>
                    </div>
                </div>
                <div className="card p-5 flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-primary-dark/10">
                        <Package className="w-6 h-6 text-primary-dark" />
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-primary-dark">{totalMeds}</p>
                        <p className="text-sm text-text-muted">Meds Given</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-5 mb-8">
                <Link
                    href="/pharmacy/dispense"
                    className="card p-6 flex items-center gap-4 group hover:border-primary-action/30 transition-all border border-transparent"
                >
                    <div className="p-3 rounded-2xl bg-primary-action text-white group-hover:scale-105 transition-transform">
                        <ScanLine className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-primary-dark">
                            Scan & Dispense
                        </h3>
                        <p className="text-sm text-text-muted">
                            Scan QR code or search prescription
                        </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-primary-action transition-colors" />
                </Link>
                <Link
                    href="/pharmacy/records"
                    className="card p-6 flex items-center gap-4 group hover:border-primary-action/30 transition-all border border-transparent"
                >
                    <div className="p-3 rounded-2xl bg-primary-dark text-white group-hover:scale-105 transition-transform">
                        <ClipboardList className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-primary-dark">
                            View Records
                        </h3>
                        <p className="text-sm text-text-muted">
                            Browse all dispensing history
                        </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-primary-action transition-colors" />
                </Link>
            </div>

            {/* Recent Activity */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-primary-dark flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary-action" />
                        Recent Activity
                    </h2>
                    {prescriptions.length > 5 && (
                        <Link
                            href="/pharmacy/records"
                            className="text-sm text-primary-action hover:underline font-medium flex items-center gap-1"
                        >
                            View All <ArrowRight className="w-4 h-4" />
                        </Link>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary-action animate-spin" />
                    </div>
                ) : recentPrescriptions.length === 0 ? (
                    <div className="card p-10 text-center">
                        <Pill className="w-10 h-10 text-text-muted mx-auto mb-3" />
                        <p className="text-text-muted">
                            No prescriptions yet. Scan a patient QR to get started!
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {recentPrescriptions.map((rx) => (
                            <PrescriptionCard
                                key={rx.id}
                                id={rx.id}
                                diagnosis={rx.diagnosis}
                                status={rx.status}
                                dateIssued={rx.dateIssued}
                                patientName={`${rx.patient.firstName} ${rx.patient.lastName}`}
                                doctorName={`${rx.doctor.firstName} ${rx.doctor.lastName}`}
                                items={rx.items}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
