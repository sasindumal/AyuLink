// ==============================================
// AyuLink - Landing Page
// Modern hero with logo, tagline, CTA buttons, and feature highlights
// ==============================================

"use client";

import Image from "next/image";
import Link from "next/link";
import {
    ArrowRight,
    Shield,
    QrCode,
    Pill,
    Stethoscope,
    Heart,
    Smartphone,
    CheckCircle,
} from "lucide-react";

const features = [
    {
        icon: QrCode,
        title: "Digital Medical ID",
        description:
            "Get a unique QR-based Medical ID that stores your health records securely in the cloud.",
    },
    {
        icon: Stethoscope,
        title: "Digital Prescriptions",
        description:
            "Doctors issue prescriptions digitally — no more lost paper chits or illegible handwriting.",
    },
    {
        icon: Pill,
        title: "Instant Dispensing",
        description:
            "Pharmacies scan your QR code to instantly verify and dispense your medications.",
    },
    {
        icon: Shield,
        title: "Secure & Private",
        description:
            "Your medical data is encrypted and only accessible to authorized healthcare providers.",
    },
];

const steps = [
    { step: "01", title: "Register", description: "Create your free AyuLink account with your NIC" },
    { step: "02", title: "Get Your Medical ID", description: "Receive a unique QR-based Digital Medical ID" },
    { step: "03", title: "Visit Doctor", description: "Show your QR code — doctor issues a digital prescription" },
    { step: "04", title: "Collect Medicine", description: "Pharmacy scans your QR to dispense your medication" },
];

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-background">
            {/* ===== Navigation ===== */}
            <nav className="flex items-center justify-between px-6 md:px-16 py-5">
                <Link href="/" className="flex items-center gap-3">
                    <Image
                        src="/logo.png"
                        alt="AyuLink"
                        width={44}
                        height={44}
                        className="rounded-xl"
                    />
                    <span className="text-2xl font-bold text-primary-dark">AyuLink</span>
                </Link>

                <div className="flex items-center gap-3">
                    <Link
                        href="/login"
                        className="btn-secondary text-sm px-5 py-2.5"
                    >
                        Sign In
                    </Link>
                    <Link
                        href="/register"
                        className="btn-primary text-sm px-5 py-2.5"
                    >
                        Get Started
                    </Link>
                </div>
            </nav>

            {/* ===== Hero Section ===== */}
            <section className="px-6 md:px-16 pt-16 pb-24 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    {/* Left: Text */}
                    <div className="animate-fade-in">
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-action/10 text-primary-action text-sm font-semibold mb-6">
                            <Heart className="w-4 h-4" />
                            Digital Healthcare for Sri Lanka
                        </span>

                        <h1 className="text-5xl md:text-6xl font-extrabold text-primary-dark leading-tight">
                            Your health records,{" "}
                            <span className="text-primary-action">one scan</span> away
                        </h1>

                        <p className="text-lg text-text-secondary mt-6 max-w-lg leading-relaxed">
                            AyuLink replaces paper prescriptions with a secure Digital Medical ID.
                            Connect patients, doctors, and pharmacies in one seamless platform.
                        </p>

                        <div className="flex flex-wrap gap-4 mt-10">
                            <Link
                                href="/register"
                                className="btn-primary flex items-center gap-2 text-base px-8 py-4"
                            >
                                Create Free Account
                                <ArrowRight className="w-5 h-5" />
                            </Link>
                            <Link
                                href="/login"
                                className="btn-secondary flex items-center gap-2 text-base px-8 py-4"
                            >
                                <Smartphone className="w-5 h-5" />
                                Sign In
                            </Link>
                        </div>

                        {/* Trust badges */}
                        <div className="flex items-center gap-6 mt-10 text-sm text-text-muted">
                            {["Secure & Encrypted", "Free for Patients", "Instant Access"].map(
                                (badge) => (
                                    <span key={badge} className="flex items-center gap-1.5">
                                        <CheckCircle className="w-4 h-4 text-primary-action" />
                                        {badge}
                                    </span>
                                )
                            )}
                        </div>
                    </div>

                    {/* Right: Visual */}
                    <div className="relative animate-slide-up hidden lg:block">
                        {/* Floating card mockup */}
                        <div className="relative">
                            {/* Background glow */}
                            <div className="absolute -inset-8 bg-gradient-to-br from-primary-action/20 via-accent-warning/10 to-primary-dark/10 rounded-3xl blur-3xl" />

                            {/* Main card */}
                            <div className="relative card p-8 max-w-sm mx-auto">
                                <div className="flex items-center gap-3 mb-6">
                                    <Image
                                        src="/logo.png"
                                        alt="AyuLink"
                                        width={40}
                                        height={40}
                                        className="rounded-xl"
                                    />
                                    <div>
                                        <p className="font-bold text-primary-dark">Digital Medical ID</p>
                                        <p className="text-xs text-text-muted">AyuLink Healthcare</p>
                                    </div>
                                </div>

                                {/* Mock QR */}
                                <div className="flex justify-center mb-6">
                                    <div className="w-40 h-40 rounded-2xl bg-gradient-to-br from-primary-dark/5 to-primary-action/5 border-2 border-dashed border-primary-action/30 flex items-center justify-center">
                                        <QrCode className="w-16 h-16 text-primary-action/50" />
                                    </div>
                                </div>

                                <div className="text-center">
                                    <p className="text-sm font-semibold text-primary-dark">
                                        John Doe
                                    </p>
                                    <p className="text-xs text-text-muted font-mono mt-1">
                                        MED-a1b2c3d4...
                                    </p>
                                </div>

                                {/* Status badge */}
                                <div className="mt-4 flex justify-center">
                                    <span className="badge-active flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-full bg-primary-action animate-pulse-soft" />
                                        Verified
                                    </span>
                                </div>
                            </div>

                            {/* Floating mini cards */}
                            <div className="absolute -top-4 -right-4 card p-3 shadow-xl animate-slide-in-right">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-primary-action/10 flex items-center justify-center">
                                        <Pill className="w-4 h-4 text-primary-action" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-primary-dark">Prescription</p>
                                        <p className="text-[10px] text-text-muted">Just issued</p>
                                    </div>
                                </div>
                            </div>

                            <div className="absolute -bottom-4 -left-4 card p-3 shadow-xl animate-slide-up">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-accent-warning/10 flex items-center justify-center">
                                        <Shield className="w-4 h-4 text-accent-warning" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-primary-dark">Encrypted</p>
                                        <p className="text-[10px] text-text-muted">AES-256 secured</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== Features Section ===== */}
            <section className="px-6 md:px-16 py-20 bg-surface">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold text-primary-dark">
                            Why <span className="text-primary-action">AyuLink</span>?
                        </h2>
                        <p className="text-text-muted mt-3 max-w-lg mx-auto">
                            A complete digital healthcare solution built for modern Sri Lanka
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {features.map((feature) => {
                            const Icon = feature.icon;
                            return (
                                <div
                                    key={feature.title}
                                    className="p-6 rounded-3xl bg-background hover:bg-surface border border-transparent hover:border-border hover:shadow-lg transition-all duration-300 group"
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-primary-action/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <Icon className="w-6 h-6 text-primary-action" />
                                    </div>
                                    <h3 className="text-lg font-bold text-primary-dark mb-2">
                                        {feature.title}
                                    </h3>
                                    <p className="text-sm text-text-muted leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ===== How It Works ===== */}
            <section className="px-6 md:px-16 py-20">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold text-primary-dark">
                            How it <span className="text-primary-action">works</span>
                        </h2>
                        <p className="text-text-muted mt-3">
                            Four simple steps to digital healthcare
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {steps.map((s, i) => (
                            <div key={s.step} className="relative">
                                {/* Connecting line */}
                                {i < steps.length - 1 && (
                                    <div className="hidden lg:block absolute top-8 left-[60%] w-full h-0.5 bg-border" />
                                )}
                                <div className="relative card p-6 text-center hover:shadow-lg transition-shadow">
                                    <div className="w-16 h-16 rounded-2xl bg-primary-action/10 flex items-center justify-center mx-auto mb-4">
                                        <span className="text-2xl font-bold text-primary-action">
                                            {s.step}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-primary-dark mb-2">
                                        {s.title}
                                    </h3>
                                    <p className="text-sm text-text-muted">{s.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===== CTA Section ===== */}
            <section className="px-6 md:px-16 py-20">
                <div className="max-w-4xl mx-auto">
                    <div className="card p-12 text-center relative overflow-hidden">
                        {/* Background accents */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-action/5 rounded-full blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent-warning/5 rounded-full blur-3xl" />

                        <div className="relative z-10">
                            <Image
                                src="/logo.png"
                                alt="AyuLink"
                                width={56}
                                height={56}
                                className="rounded-2xl mx-auto mb-6"
                            />
                            <h2 className="text-3xl font-bold text-primary-dark mb-4">
                                Ready to go digital?
                            </h2>
                            <p className="text-text-muted mb-8 max-w-md mx-auto">
                                Join AyuLink today and experience the future of healthcare in Sri Lanka.
                                Free for all patients.
                            </p>
                            <Link
                                href="/register"
                                className="btn-primary inline-flex items-center gap-2 text-lg px-10 py-4"
                            >
                                Get Started for Free
                                <ArrowRight className="w-5 h-5" />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== Footer ===== */}
            <footer className="px-6 md:px-16 py-8 border-t border-border">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Image src="/logo.png" alt="AyuLink" width={28} height={28} className="rounded-lg" />
                        <span className="text-sm font-semibold text-primary-dark">AyuLink</span>
                    </div>
                    <p className="text-xs text-text-muted">
                        © {new Date().getFullYear()} AyuLink Digital Healthcare. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
