// ==============================================
// AyuLink - Doctor: My Prescriptions Page
// List of all prescriptions issued by this doctor
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import PrescriptionCard from "@/components/PrescriptionCard";
import {
    FileText,
    Search,
    Activity,
    CheckCircle,
    ClipboardList,
    Loader2,
    Inbox,
    Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Prescription {
    id: string;
    diagnosis: string;
    status: "ACTIVE" | "DISPENSED";
    dateIssued: string;
    items: any[];
    patient: {
        firstName: string;
        lastName: string;
    };
}

type FilterType = "ALL" | "ACTIVE" | "DISPENSED";

export default function DoctorPrescriptionsPage() {
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
            `${rx.patient.firstName} ${rx.patient.lastName}`
                .toLowerCase()
                .includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const activeCount = prescriptions.filter((rx) => rx.status === "ACTIVE").length;
    const dispensedCount = prescriptions.filter((rx) => rx.status === "DISPENSED").length;

    const filters: { key: FilterType; label: string; count: number; icon: React.ReactNode }[] = [
        { key: "ALL", label: "All Issued", count: prescriptions.length, icon: <ClipboardList className="w-4 h-4" /> },
        { key: "ACTIVE", label: "Active", count: activeCount, icon: <Activity className="w-4 h-4" /> },
        { key: "DISPENSED", label: "Dispensed", count: dispensedCount, icon: <CheckCircle className="w-4 h-4" /> },
    ];

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary-dark flex items-center gap-3">
                    My Prescriptions
                    <FileText className="w-8 h-8 text-primary-action" />
                </h1>
                <p className="text-text-muted mt-1">
                    Track all prescriptions you have issued to patients
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="card p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary-action/10">
                        <Stethoscope className="w-5 h-5 text-primary-action" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary-dark">{prescriptions.length}</p>
                        <p className="text-xs text-text-muted">Total Issued</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary-action/10">
                        <Activity className="w-5 h-5 text-primary-action" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary-dark">{activeCount}</p>
                        <p className="text-xs text-text-muted">Active</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-text-muted/10">
                        <CheckCircle className="w-5 h-5 text-text-muted" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary-dark">{dispensedCount}</p>
                        <p className="text-xs text-text-muted">Dispensed</p>
                    </div>
                </div>
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
                        <span className={cn(
                            "ml-1 text-xs px-2 py-0.5 rounded-full",
                            filter === f.key ? "bg-white/20 text-white" : "bg-background text-text-muted"
                        )}>
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
                    placeholder="Search by patient name or diagnosis..."
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
                            : "Prescriptions you issue will appear here"}
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
                            patientName={`${rx.patient.firstName} ${rx.patient.lastName}`}
                            items={rx.items}
                            expanded={true}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
