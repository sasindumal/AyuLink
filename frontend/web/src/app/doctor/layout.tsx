// ==============================================
// AyuLink - Doctor Route Layout
// ==============================================

"use client";

import DashboardLayout from "@/components/DashboardLayout";

export default function DoctorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardLayout allowedRole="DOCTOR">{children}</DashboardLayout>;
}
