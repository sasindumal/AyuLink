// ==============================================
// AyuLink - Pharmacy Route Layout
// ==============================================

"use client";

import DashboardLayout from "@/components/DashboardLayout";

export default function PharmacyLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardLayout allowedRole="PHARMACIST">{children}</DashboardLayout>;
}
