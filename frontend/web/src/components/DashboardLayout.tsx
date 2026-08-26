// ==============================================
// AyuLink - Dashboard Layout Wrapper
// Shared layout for Patient, Doctor, and Pharmacy dashboards
// Provides sidebar + main content area
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { Loader2 } from "lucide-react";

interface DashboardLayoutProps {
    children: React.ReactNode;
    allowedRole: "PATIENT" | "DOCTOR" | "PHARMACIST";
}

export default function DashboardLayout({
    children,
    allowedRole,
}: DashboardLayoutProps) {
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        } else if (status === "authenticated" && session?.user?.role !== allowedRole) {
            // Redirect to correct dashboard
            const role = session?.user?.role;
            if (role === "DOCTOR") router.push("/doctor/dashboard");
            else if (role === "PHARMACIST") router.push("/pharmacy/dashboard");
            else router.push("/patient/dashboard");
        }
    }, [status, session, router, allowedRole]);

    if (status === "loading") {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 animate-pulse-soft">
                    <Loader2 className="w-10 h-10 text-primary-action animate-spin" />
                    <p className="text-text-muted text-sm">Loading your dashboard...</p>
                </div>
            </div>
        );
    }

    if (!session || session.user?.role !== allowedRole) {
        return null;
    }

    return (
        <div className="min-h-screen bg-background">
            <Sidebar />
            <main className="ml-72 p-8">
                {children}
            </main>
        </div>
    );
}
