// ==============================================
// AyuLink - Pharmacy: Records Page
// Shows only items dispensed by this pharmacy
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
    ClipboardList,
    Search,
    CheckCircle,
    Loader2,
    Inbox,
    Package,
    Pill,
    Clock,
    Calendar,
    Stethoscope,
    User,
    Building2,
} from "lucide-react";

interface DispensedItem {
    id: string;
    drugName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
    dispensed: boolean;
    dispensedAt: string | null;
    dispensedBy?: {
        id: string;
        firstName: string;
        lastName: string;
        pharmacyProfile?: {
            pharmacyName: string;
            licenseNumber: string;
        };
    } | null;
}

interface Prescription {
    id: string;
    diagnosis: string;
    status: "ACTIVE" | "DISPENSED";
    dateIssued: string;
    items: DispensedItem[];
    patient: { firstName: string; lastName: string };
    doctor: {
        firstName: string;
        lastName: string;
        doctorProfile?: { specialization: string; hospitalName: string };
    };
}

export default function PharmacyRecordsPage() {
    const { data: session } = useSession();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    const currentUserId = (session?.user as any)?.id;

    useEffect(() => {
        fetchRecords();
    }, []);

    const fetchRecords = async () => {
        try {
            const res = await fetch("/api/prescriptions");
            const data = await res.json();
            setPrescriptions(data.prescriptions || []);
        } catch (err) {
            console.error("Failed to fetch records:", err);
        } finally {
            setLoading(false);
        }
    };

    // Filter prescriptions by search, and only keep items dispensed by THIS pharmacist
    const processedRecords = prescriptions
        .map((rx) => {
            const myDispensedItems = rx.items.filter(
                (item) => item.dispensed && item.dispensedBy?.id === currentUserId
            );
            return { ...rx, myItems: myDispensedItems };
        })
        .filter((rx) => {
            if (rx.myItems.length === 0) return false;
            if (searchQuery === "") return true;
            const q = searchQuery.toLowerCase();
            return (
                rx.diagnosis.toLowerCase().includes(q) ||
                `${rx.patient.firstName} ${rx.patient.lastName}`.toLowerCase().includes(q) ||
                rx.id.toLowerCase().includes(q)
            );
        });

    const totalDispensedItems = processedRecords.reduce(
        (sum, rx) => sum + rx.myItems.length,
        0
    );

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
                    Dispensing Records
                    <ClipboardList className="w-8 h-8 text-primary-action" />
                </h1>
                <p className="text-text-muted mt-1">
                    Medicines dispensed by your pharmacy
                </p>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="card p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary-action/10">
                        <ClipboardList className="w-5 h-5 text-primary-action" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary-dark">
                            {processedRecords.length}
                        </p>
                        <p className="text-xs text-text-muted">Prescriptions</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary-action/10">
                        <CheckCircle className="w-5 h-5 text-primary-action" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary-dark">
                            {totalDispensedItems}
                        </p>
                        <p className="text-xs text-text-muted">Meds Dispensed</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary-dark/10">
                        <Package className="w-5 h-5 text-primary-dark" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary-dark">
                            {new Set(processedRecords.map((rx) => `${rx.patient.firstName} ${rx.patient.lastName}`)).size}
                        </p>
                        <p className="text-xs text-text-muted">Patients Served</p>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by patient name, diagnosis, or prescription ID..."
                    className="input-field pl-12"
                />
            </div>

            {/* Records List */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-primary-action animate-spin" />
                </div>
            ) : processedRecords.length === 0 ? (
                <div className="card p-12 text-center">
                    <Inbox className="w-12 h-12 text-text-muted mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-primary-dark mb-2">
                        No records found
                    </h3>
                    <p className="text-sm text-text-muted">
                        {searchQuery
                            ? "Try adjusting your search terms"
                            : "Prescriptions you dispense will appear here"}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {processedRecords.map((rx) => (
                        <div
                            key={rx.id}
                            className="card p-6 border-l-4 border-l-primary-action animate-slide-up"
                        >
                            {/* Header — NO status badge */}
                            <div className="mb-4">
                                <h4 className="text-lg font-bold text-primary-dark">
                                    {rx.diagnosis}
                                </h4>
                                <div className="flex items-center gap-4 mt-2 text-sm text-text-muted">
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        {formatDate(rx.dateIssued)}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Stethoscope className="w-4 h-4" />
                                        Dr. {rx.doctor.firstName} {rx.doctor.lastName}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <User className="w-4 h-4" />
                                        {rx.patient.firstName} {rx.patient.lastName}
                                    </span>
                                </div>
                                {rx.doctor.doctorProfile && (
                                    <p className="text-xs text-text-muted mt-1">
                                        {rx.doctor.doctorProfile.specialization} •{" "}
                                        {rx.doctor.doctorProfile.hospitalName}
                                    </p>
                                )}
                            </div>

                            {/* Only items dispensed by THIS pharmacy */}
                            <div className="pt-4 border-t border-border space-y-3">
                                <p className="text-sm font-semibold text-primary-dark flex items-center gap-2">
                                    <Pill className="w-4 h-4 text-primary-action" />
                                    Dispensed by Your Pharmacy ({rx.myItems.length})
                                </p>
                                {rx.myItems.map((item) => (
                                    <div
                                        key={item.id}
                                        className="p-3 rounded-xl bg-primary-action/5 border border-primary-action/20"
                                    >
                                        <div className="flex items-start gap-3">
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
                                                {item.dispensedAt && (
                                                    <div className="mt-1.5 space-y-0.5">
                                                        <p className="text-xs text-primary-action flex items-center gap-1">
                                                            <CheckCircle className="w-3 h-3" />
                                                            Dispensed at {formatTime(item.dispensedAt)}
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
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Prescription ID */}
                            <div className="mt-4 pt-3 border-t border-border/50">
                                <p className="text-xs text-text-muted font-mono">
                                    Rx #{rx.id.slice(0, 8).toUpperCase()}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
