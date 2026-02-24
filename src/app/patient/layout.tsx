// ==============================================
// AyuLink - Patient Route Layout
// ==============================================

"use client";

import DashboardLayout from "@/components/DashboardLayout";

export default function PatientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardLayout allowedRole="PATIENT">{children}</DashboardLayout>;
}
