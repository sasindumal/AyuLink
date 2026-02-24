// ==============================================
// AyuLink - Pharmacy Dashboard
// Overview with stats and quick actions
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Pill,
    ScanLine,
    ClipboardList,
    CheckCircle,
    Package,
    ArrowRight,
} from "lucide-react";

interface Prescription {
    id: string;
    status: "ACTIVE" | "DISPENSED";
    items: any[];
}

export default function PharmacyDashboard() {
    const { data: session } = useSession();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);

    useEffect(() => {
        const fetchPrescriptions = async () => {
            try {
                const res = await fetch("/api/prescriptions");
                const data = await res.json();
                setPrescriptions(data.prescriptions || []);
            } catch (err) {
                console.error("Failed to fetch:", err);
            }
        };
        fetchPrescriptions();
    }, []);

    const dispensedCount = prescriptions.filter((rx) => rx.status === "DISPENSED").length;
    const totalMeds = prescriptions
        .filter((rx) => rx.status === "DISPENSED")
        .reduce((sum, rx) => sum + rx.items.length, 0);

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
            <div className="grid grid-cols-3 gap-4 mb-8">
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
            <div className="grid grid-cols-2 gap-5">
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
        </div>
    );
}
