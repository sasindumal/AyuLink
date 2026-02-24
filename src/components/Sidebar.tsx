// ==============================================
// AyuLink - Dashboard Sidebar Navigation
// Role-based navigation with logo and logout
// ==============================================

"use client";

import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
    LayoutDashboard,
    QrCode,
    ClipboardList,
    Stethoscope,
    Pill,
    LogOut,
    User,
    ScanLine,
    FileText,
    Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Define navigation items per role
const navItems = {
    PATIENT: [
        { href: "/patient/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/patient/medical-id", label: "My Medical ID", icon: QrCode },
        { href: "/patient/prescriptions", label: "Prescriptions", icon: ClipboardList },
    ],
    DOCTOR: [
        { href: "/doctor/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/doctor/scan", label: "Scan Patient", icon: ScanLine },
        { href: "/doctor/prescriptions", label: "Issued Prescriptions", icon: FileText },
    ],
    PHARMACIST: [
        { href: "/pharmacy/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/pharmacy/dispense", label: "Scan & Dispense", icon: Pill },
        { href: "/pharmacy/records", label: "Records", icon: ClipboardList },
    ],
};

export default function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const [pharmacyName, setPharmacyName] = useState<string | null>(null);

    const role = session?.user?.role || "PATIENT";
    const items = navItems[role as keyof typeof navItems] || navItems.PATIENT;
    const userName = session?.user
        ? `${session.user.firstName} ${session.user.lastName}`
        : "User";

    const isPharmacy = role === "PHARMACIST";

    // Fetch pharmacy name for pharmacist users
    useEffect(() => {
        if (isPharmacy) {
            fetch("/api/pharmacy/profile")
                .then((res) => res.json())
                .then((data) => {
                    if (data.pharmacyProfile?.pharmacyName) {
                        setPharmacyName(data.pharmacyProfile.pharmacyName);
                    }
                })
                .catch(() => { });
        }
    }, [isPharmacy]);

    // Display name and role label
    const displayName = isPharmacy ? (pharmacyName || "Loading...") : userName;
    const displayRole = isPharmacy ? "Pharmacy" : role === "DOCTOR" ? "Doctor" : "Patient";

    return (
        <aside className="w-72 h-screen bg-surface border-r border-border flex flex-col fixed left-0 top-0 z-40">
            {/* Logo Area */}
            <div className="px-6 py-6 border-b border-border">
                <Link href="/" className="flex items-center gap-3">
                    <Image
                        src="/logo.png"
                        alt="AyuLink"
                        width={44}
                        height={44}
                        className="rounded-xl"
                    />
                    <div>
                        <h1 className="text-xl font-bold text-primary-dark">AyuLink</h1>
                        <p className="text-xs text-text-muted">Digital Healthcare</p>
                    </div>
                </Link>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 px-4 py-6 space-y-1.5">
                {items.map((item, index) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                        <Link
                            key={`${item.href}-${index}`}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                                isActive
                                    ? "bg-primary-action/10 text-primary-action shadow-sm"
                                    : "text-text-secondary hover:bg-background hover:text-primary-dark"
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span>{item.label}</span>
                            {isActive && (
                                <div className="ml-auto w-2 h-2 rounded-full bg-primary-action" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* User Info & Logout */}
            <div className="p-4 border-t border-border">
                {/* User Card */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary-action/10 flex items-center justify-center">
                        {isPharmacy ? (
                            <Building2 className="w-5 h-5 text-primary-action" />
                        ) : (
                            <User className="w-5 h-5 text-primary-action" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary-dark truncate">
                            {displayName}
                        </p>
                        <p className="text-xs text-text-muted">
                            {displayRole}
                        </p>
                    </div>
                </div>

                {/* Logout Button */}
                <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    <span>Sign Out</span>
                </button>
            </div>
        </aside>
    );
}

