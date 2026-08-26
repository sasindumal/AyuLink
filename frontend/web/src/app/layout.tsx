// ==============================================
// AyuLink - Root Layout
// Global layout with font, background, and session provider
// ==============================================

import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import AuthProvider from "@/components/AuthProvider";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700", "800"],
    variable: "--font-sans",
});

export const metadata: Metadata = {
    title: "AyuLink – Digital Healthcare Platform",
    description:
        "Replace physical prescriptions with a secure Digital Medical ID and digital prescription system. Connect patients, doctors, and pharmacies seamlessly.",
    keywords: ["healthcare", "digital prescription", "medical ID", "Sri Lanka", "AyuLink"],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={plusJakarta.variable}>
            <body className="bg-background font-sans antialiased min-h-screen">
                <AuthProvider>{children}</AuthProvider>
            </body>
        </html>
    );
}
