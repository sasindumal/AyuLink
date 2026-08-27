// ==============================================
// AyuLink - Root Layout
// This is a marketing/information website, not an app — it
// describes AyuLink and links to the mobile apps. No auth, no
// session state, no server-side data of its own.
// ==============================================

import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700", "800"],
    variable: "--font-sans",
});

export const metadata: Metadata = {
    title: "AyuLink – Digital Healthcare Platform",
    description:
        "AyuLink replaces paper prescriptions with a secure Digital Medical ID, connecting patients, doctors, pharmacies, and channeling centers. Learn more and get the apps.",
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
                {children}
            </body>
        </html>
    );
}
