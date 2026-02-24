// ==============================================
// AyuLink - Patient: Prescriptions Page
// Full prescription list with filters & search
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import PrescriptionCard from "@/components/PrescriptionCard";
import {
    Search,
    Filter,
    ClipboardList,
    Activity,
    CheckCircle,
    Loader2,
    Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Prescription {
    id: string;
    diagnosis: string;
    status: "NOT_DISPENSED" | "PARTIALLY_DISPENSED" | "FULLY_DISPENSED";
    dateIssued: string;
    items: any[];
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

type FilterType = "ALL" | "NOT_DISPENSED" | "PARTIALLY_DISPENSED" | "FULLY_DISPENSED";

export default function PrescriptionsPage() {
    const { data: session } = useSession();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>("ALL");
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        fetchPrescriptions();
    }, []);

    const fetchPrescriptions = async () => {
        try {
            const res = await fetch("/api/prescriptions");
            const data = await res.json();
            setPrescriptions(data.prescriptions || []);
        } catch (err) {
            console.error("Failed to fetch prescriptions:", err);
        } finally {
            setLoading(false);
        }
    };

    const filtered = prescriptions.filter((rx) => {
        const matchesFilter = filter === "ALL" || rx.status === filter;
        const matchesSearch =
            searchQuery === "" ||
            rx.diagnosis.toLowerCase().includes(searchQuery.toLowerCase()) ||
            `${rx.doctor.firstName} ${rx.doctor.lastName}`
                .toLowerCase()
                .includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const notDispensedCount = prescriptions.filter((rx) => rx.status === "NOT_DISPENSED").length;
    const partialCount = prescriptions.filter((rx) => rx.status === "PARTIALLY_DISPENSED").length;
    const fullyCount = prescriptions.filter((rx) => rx.status === "FULLY_DISPENSED").length;

    const filters: { key: FilterType; label: string; count: number; icon: React.ReactNode }[] = [
        { key: "ALL", label: "All", count: prescriptions.length, icon: <ClipboardList className="w-4 h-4" /> },
        { key: "NOT_DISPENSED", label: "Not Dispensed", count: notDispensedCount, icon: <Activity className="w-4 h-4" /> },
        { key: "PARTIALLY_DISPENSED", label: "Partial", count: partialCount, icon: <Activity className="w-4 h-4" /> },
        { key: "FULLY_DISPENSED", label: "Fully Dispensed", count: fullyCount, icon: <CheckCircle className="w-4 h-4" /> },
    ];

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary-dark flex items-center gap-3">
                    My Prescriptions
                    <ClipboardList className="w-8 h-8 text-primary-action" />
                </h1>
                <p className="text-text-muted mt-1">
                    View and track all your prescriptions in one place
                </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-3 mb-6">
                {filters.map((f) => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                            filter === f.key
                                ? "bg-primary-action text-white shadow-sm"
                                : "bg-surface text-text-secondary hover:bg-background border border-border"
                        )}
                    >
                        {f.icon}
                        {f.label}
                        <span
                            className={cn(
                                "ml-1 text-xs px-2 py-0.5 rounded-full",
                                filter === f.key
                                    ? "bg-white/20 text-white"
                                    : "bg-background text-text-muted"
                            )}
                        >
                            {f.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by diagnosis or doctor name..."
                    className="input-field pl-12"
                />
            </div>

            {/* Prescription List */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-primary-action animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="card p-12 text-center">
                    <Inbox className="w-12 h-12 text-text-muted mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-primary-dark mb-2">
                        No prescriptions found
                    </h3>
                    <p className="text-sm text-text-muted">
                        {searchQuery
                            ? "Try adjusting your search terms"
                            : filter !== "ALL"
                                ? `No ${filter.toLowerCase()} prescriptions`
                                : "Your prescriptions will appear here after a doctor issues one"}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filtered.map((rx) => (
                        <PrescriptionCard
                            key={rx.id}
                            id={rx.id}
                            diagnosis={rx.diagnosis}
                            status={rx.status}
                            dateIssued={rx.dateIssued}
                            doctorName={`${rx.doctor.firstName} ${rx.doctor.lastName}`}
                            doctorSpecialization={rx.doctor.doctorProfile?.specialization}
                            hospitalName={rx.doctor.doctorProfile?.hospitalName}
                            slmcRegNo={rx.doctor.doctorProfile?.slmcRegNo}
                            items={rx.items}
                            expanded={true}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
