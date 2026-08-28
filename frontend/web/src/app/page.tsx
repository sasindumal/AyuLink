// ==============================================
// AyuLink - Marketing Website
// This is an informational site, not the app itself — it explains
// AyuLink and links out to the four mobile apps. No login, no
// dashboards, no backend calls live here.
// ==============================================

"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowRight,
    Shield,
    QrCode,
    Pill,
    Stethoscope,
    Heart,
    CheckCircle,
    Building2,
    UserRound,
    Apple,
    Download,
    Sparkles,
    CalendarSearch,
    Bot,
    Github,
} from "lucide-react";

// Every workflow run (tag push or manual dispatch) publishes a GitHub
// Release with make_latest, so these URLs always resolve to the newest
// build without the site ever needing to change.
// See .github/workflows/build-mobile-apps.yml
const RELEASES_BASE =
    "https://github.com/sasindumal/AyuLink/releases/latest/download";

const features = [
    {
        icon: Sparkles,
        title: "AI Symptom Triage",
        description:
            "Describe how you're feeling in a chat — an AI assistant, grounded in a real medical knowledge graph, narrows things down and points you to the right specialist.",
    },
    {
        icon: CalendarSearch,
        title: "Find & Book Doctors",
        description:
            "Search by specialty, city, or rating — or browse by doctor or by channeling center — and book, reschedule, or cancel a real appointment slot in seconds.",
    },
    {
        icon: QrCode,
        title: "Digital Medical ID",
        description:
            "A unique QR-based Medical ID stands in for a paper record — show it to a doctor or pharmacy for instant lookup.",
    },
    {
        icon: Stethoscope,
        title: "Digital Prescriptions",
        description:
            "Doctors issue structured prescriptions digitally — no more lost paper chits or illegible handwriting, with an expiry so old prescriptions archive themselves.",
    },
    {
        icon: Pill,
        title: "Instant Dispensing",
        description:
            "Pharmacies scan a patient's Medical ID — or a single prescription's own QR, so nothing else is revealed — to verify and dispense medication, item by item.",
    },
    {
        icon: Shield,
        title: "Secure by Design",
        description:
            "Every app talks to the database through role-checked functions — there is no path to another patient's records.",
    },
];

const steps = [
    { step: "01", title: "Download the app", description: "Install AyuLink and register with your NIC" },
    { step: "02", title: "Get your Medical ID", description: "Your account comes with a unique QR-based Digital Medical ID" },
    { step: "03", title: "Find a doctor, or ask the AI", description: "Search by specialty, city, or rating — or describe your symptoms and let the AI assistant point you the right way" },
    { step: "04", title: "Visit & collect", description: "Show your QR at the doctor for a digital prescription, then at the pharmacy to collect it" },
];

const apps = [
    {
        icon: UserRound,
        name: "AyuLink",
        audience: "For patients",
        description:
            "Your Digital Medical ID, an AI assistant for symptom triage, doctor & appointment discovery, and your full prescription history in one place.",
        apk: "patient-app.apk",
    },
    {
        icon: Stethoscope,
        name: "AyuLink Doctor",
        audience: "For doctors",
        description:
            "Scan a patient's Medical ID and issue a structured digital prescription in minutes — editable for a day, with automatic expiry so nothing lingers.",
        apk: "doctor-app.apk",
    },
    {
        icon: Pill,
        name: "AyuLink Pharmacy",
        audience: "For pharmacies",
        description:
            "Scan a Medical ID or a single prescription's own QR and dispense item by item, with a 15-minute undo window.",
        apk: "pharmacy-app.apk",
    },
    {
        icon: Building2,
        name: "AyuLink Channeling Center",
        audience: "For channeling centers",
        description: "Manage every appointment booked at your location — confirm, reschedule, cancel, or complete.",
        apk: "channeling-center-app.apk",
    },
];

// Facts a visitor cares about, not architecture. "4 user roles" and
// "50+ role-checked database functions" were true but were describing
// the build to the wrong audience — nobody choosing a health app is
// counting stored procedures.
const stats = [
    { value: "4", label: "Free apps, one per role" },
    { value: "1", label: "QR for every doctor & pharmacy" },
    { value: "24/7", label: "AI health assistant" },
    { value: "2", label: "Languages — English & Sinhala" },
];

/**
 * Fade-and-rise elements as they enter the viewport.
 *
 * The hidden state is added here, at runtime, rather than living in the
 * stylesheet: if the script never runs, nothing is ever hidden and the
 * page reads normally. Hiding in CSS and revealing with JS gets that
 * backwards and risks a blank page.
 */
function useReveal() {
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const nodes = root.current?.querySelectorAll<HTMLElement>("[data-reveal]");
        if (!nodes?.length) return;

        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduced || typeof IntersectionObserver === "undefined") return;

        nodes.forEach((n) => n.classList.add("reveal-armed"));

        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target as HTMLElement;
                    const delay = Number(el.dataset.revealDelay ?? 0);
                    window.setTimeout(() => {
                        el.classList.remove("reveal-armed");
                        el.classList.add("reveal-in");
                    }, delay);
                    io.unobserve(el);
                });
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
        );

        nodes.forEach((n) => io.observe(n));
        return () => io.disconnect();
    }, []);

    return root;
}

export default function LandingPage() {
    const root = useReveal();

    return (
        <div ref={root} className="min-h-screen">
            {/* The layer every frosted panel on this page is sampling. */}
            <div className="backdrop-orbs" aria-hidden="true">
                <div className="orb orb-lime" />
                <div className="orb orb-forest" />
                <div className="orb orb-amber" />
            </div>
            <div className="backdrop-grain" aria-hidden="true" />

            {/* ===== Navigation ===== */}
            <header className="sticky top-0 z-50 glass-nav">
                <nav className="flex items-center justify-between px-6 md:px-12 py-4 max-w-7xl mx-auto">
                    <Link href="/" className="flex items-center gap-3">
                        <Image
                            src="/logo.png"
                            alt="AyuLink"
                            width={42}
                            height={42}
                            className="rounded-xl"
                        />
                        <span className="text-xl md:text-2xl font-extrabold tracking-tight text-primary-dark">
                            AyuLink
                        </span>
                    </Link>

                    <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-text-secondary">
                        <a href="#features" className="hover:text-primary-dark transition-colors">Features</a>
                        <a href="#how-it-works" className="hover:text-primary-dark transition-colors">How it works</a>
                        <a href="#apps" className="hover:text-primary-dark transition-colors">Apps</a>
                    </div>

                    <a href="#apps" className="btn-primary text-sm px-5 py-2.5">
                        Get the App
                    </a>
                </nav>
            </header>

            {/* ===== Hero ===== */}
            <section className="px-6 md:px-12 pt-16 md:pt-24 pb-24 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">
                    <div data-reveal>
                        <span className="badge-glass mb-7">
                            <Heart className="w-4 h-4 text-primary-action" />
                            Digital Healthcare for Sri Lanka
                        </span>

                        <h1 className="text-5xl md:text-6xl xl:text-7xl font-extrabold leading-[1.05] tracking-tight text-primary-dark">
                            Your health records,{" "}
                            <span className="text-gradient">one scan</span> away
                        </h1>

                        <p className="text-lg text-text-secondary mt-7 max-w-xl leading-relaxed">
                            From an AI symptom check-in to finding and booking a doctor to a
                            digital prescription you can collect at any pharmacy — AyuLink
                            connects patients, doctors, pharmacies, and channeling centers on
                            one platform, with a QR-based Digital Medical ID at the center of
                            it. Four free apps, one for each of you.
                        </p>

                        <div className="flex flex-wrap gap-4 mt-10">
                            <a href="#apps" className="btn-primary flex items-center gap-2 text-base px-8 py-4">
                                Get the App
                                <ArrowRight className="w-5 h-5" />
                            </a>
                            <a href="#how-it-works" className="btn-secondary flex items-center gap-2 text-base px-8 py-4">
                                See How It Works
                            </a>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-10 text-sm text-text-muted">
                            {["Secure by Design", "Free for Patients", "Instant Access"].map((badge) => (
                                <span key={badge} className="flex items-center gap-1.5">
                                    <CheckCircle className="w-4 h-4 text-primary-action" />
                                    {badge}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Right: the glass showcase */}
                    <div className="relative hidden lg:block" data-reveal data-reveal-delay="120">
                        <div className="relative">
                            <div className="glass glass-strong p-8 max-w-sm mx-auto animate-float-slow">
                                <div className="flex items-center gap-3 mb-7">
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

                                <div className="flex justify-center mb-6">
                                    <div className="w-44 h-44 rounded-3xl bg-gradient-to-br from-primary-dark/8 to-primary-action/8 border border-white/70 flex items-center justify-center shadow-inner">
                                        <QrCode className="w-20 h-20 text-primary-dark/45" strokeWidth={1.25} />
                                    </div>
                                </div>

                                <div className="text-center">
                                    <p className="text-sm font-semibold text-primary-dark">Kasun Jayawardena</p>
                                    <p className="text-xs text-text-muted font-mono mt-1">AYU-200012345678</p>
                                </div>

                                <div className="mt-5 flex justify-center">
                                    <span className="badge-active flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-primary-action animate-pulse-soft" />
                                        Verified
                                    </span>
                                </div>
                            </div>

                            {/* Floating satellites — offset so they overlap the
                                main card's edge, which is what makes the stack
                                read as depth rather than three flat cards. */}
                            <div className="absolute -top-5 -right-2 glass p-3.5 animate-float-slower">
                                <div className="flex items-center gap-2.5">
                                    <div className="icon-tile w-9 h-9">
                                        <Pill className="w-4 h-4 text-primary-dark" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-primary-dark">Prescription</p>
                                        <p className="text-[10px] text-text-muted">Just issued</p>
                                    </div>
                                </div>
                            </div>

                            <div className="absolute top-1/3 -left-8 glass p-3.5 animate-float-slow">
                                <div className="flex items-center gap-2.5">
                                    <div className="icon-tile w-9 h-9">
                                        <Bot className="w-4 h-4 text-primary-dark" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-primary-dark">Ayu</p>
                                        <p className="text-[10px] text-text-muted">Health assistant</p>
                                    </div>
                                </div>
                            </div>

                            <div className="absolute -bottom-5 left-4 glass p-3.5 animate-float-slower">
                                <div className="flex items-center gap-2.5">
                                    <div className="icon-tile w-9 h-9">
                                        <Shield className="w-4 h-4 text-primary-dark" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-primary-dark">Secured</p>
                                        <p className="text-[10px] text-text-muted">Row-level access control</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stat strip */}
                <div className="glass glass-faint mt-20 px-6 py-7 md:px-10" data-reveal data-reveal-delay="80">
                    <dl className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                        {stats.map((s) => (
                            <div key={s.label}>
                                <dt className="text-3xl md:text-4xl font-extrabold text-gradient">{s.value}</dt>
                                <dd className="text-xs md:text-sm text-text-muted mt-1.5 font-medium">{s.label}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            {/* ===== Features ===== */}
            <section id="features" className="px-6 md:px-12 py-24 scroll-mt-24">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16" data-reveal>
                        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-primary-dark">
                            Why <span className="text-gradient">AyuLink</span>?
                        </h2>
                        <p className="text-text-muted mt-4 max-w-xl mx-auto leading-relaxed">
                            From an AI-assisted first check-in to picking up medication —
                            one connected platform for the whole visit
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature, i) => {
                            const Icon = feature.icon;
                            return (
                                <div
                                    key={feature.title}
                                    className="glass glass-hover group p-7"
                                    data-reveal
                                    data-reveal-delay={i * 70}
                                >
                                    <div className="icon-tile w-13 h-13 p-3.5 mb-5 w-fit">
                                        <Icon className="w-6 h-6 text-primary-dark" />
                                    </div>
                                    <h3 className="text-lg font-bold text-primary-dark mb-2.5">
                                        {feature.title}
                                    </h3>
                                    <p className="text-sm text-text-secondary leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            <div className="rule-fade max-w-5xl mx-auto" />

            {/* ===== How It Works ===== */}
            <section id="how-it-works" className="px-6 md:px-12 py-24 scroll-mt-24">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16" data-reveal>
                        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-primary-dark">
                            How it <span className="text-gradient">works</span>
                        </h2>
                        <p className="text-text-muted mt-4">Four simple steps to digital healthcare</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {steps.map((s, i) => (
                            <div key={s.step} className="relative" data-reveal data-reveal-delay={i * 90}>
                                {i < steps.length - 1 && (
                                    <div className="hidden lg:block absolute top-14 left-[58%] w-[84%] h-px bg-gradient-to-r from-primary-action/40 to-transparent" />
                                )}
                                <div className="glass glass-hover p-7 text-center h-full">
                                    <div className="icon-tile w-16 h-16 mx-auto mb-5">
                                        <span className="text-2xl font-extrabold text-gradient">{s.step}</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-primary-dark mb-2">{s.title}</h3>
                                    <p className="text-sm text-text-secondary leading-relaxed">{s.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <div className="rule-fade max-w-5xl mx-auto" />

            {/* ===== Get the Apps ===== */}
            <section id="apps" className="px-6 md:px-12 py-24 scroll-mt-24">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16" data-reveal>
                        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-primary-dark">
                            Get the <span className="text-gradient">app</span>
                        </h2>
                        <p className="text-text-muted mt-4 max-w-xl mx-auto leading-relaxed">
                            One free app for each side of the platform — patients, doctors,
                            pharmacies, and channeling centers.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {apps.map((app, i) => {
                            const Icon = app.icon;
                            return (
                                <div
                                    key={app.name}
                                    className="glass glass-hover group p-7 flex flex-col"
                                    data-reveal
                                    data-reveal-delay={i * 80}
                                >
                                    <div className="icon-tile w-13 h-13 p-3.5 mb-5 w-fit">
                                        <Icon className="w-6 h-6 text-primary-dark" />
                                    </div>
                                    <p className="text-[11px] font-bold text-primary-action uppercase tracking-widest mb-1.5">
                                        {app.audience}
                                    </p>
                                    <h3 className="text-lg font-bold text-primary-dark mb-2.5">{app.name}</h3>
                                    <p className="text-sm text-text-secondary leading-relaxed flex-1">
                                        {app.description}
                                    </p>

                                    <div className="flex flex-col gap-2.5 mt-7">
                                        <a
                                            href={`${RELEASES_BASE}/${app.apk}`}
                                            className="btn-primary flex items-center justify-center gap-2 text-xs px-4 py-3"
                                        >
                                            <Download className="w-4 h-4" />
                                            Download APK (Android)
                                        </a>
                                        <span className="flex items-center justify-center gap-2 text-xs font-semibold text-text-muted bg-white/50 border border-white/60 rounded-xl px-4 py-3">
                                            <Apple className="w-4 h-4" />
                                            App Store — Coming Soon
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-center text-sm text-text-muted mt-12 max-w-2xl mx-auto leading-relaxed">
                        Not on the Play Store yet — download the Android APK directly above, or find
                        the source on{" "}
                        <a
                            href="https://github.com/sasindumal/AyuLink"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-dark font-semibold hover:underline"
                        >
                            GitHub
                        </a>
                        . Installing an APK outside the Play Store requires allowing
                        &ldquo;Install unknown apps&rdquo; for your browser in Android Settings.
                    </p>
                </div>
            </section>

            {/* ===== CTA ===== */}
            <section className="px-6 md:px-12 pb-24">
                <div className="max-w-4xl mx-auto" data-reveal>
                    <div className="glass glass-strong p-10 md:p-14 text-center relative overflow-hidden">
                        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary-action/20 blur-3xl" aria-hidden="true" />
                        <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-accent-warning/20 blur-3xl" aria-hidden="true" />

                        <div className="relative z-10">
                            <Image
                                src="/logo.png"
                                alt="AyuLink"
                                width={60}
                                height={60}
                                className="rounded-2xl mx-auto mb-7"
                            />
                            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-primary-dark mb-4">
                                Ready to go digital?
                            </h2>
                            <p className="text-text-secondary mb-9 max-w-md mx-auto leading-relaxed">
                                Get AyuLink today and experience the future of healthcare in Sri
                                Lanka. Free for all patients.
                            </p>
                            <a
                                href="#apps"
                                className="btn-primary inline-flex items-center gap-2 text-lg px-10 py-4"
                            >
                                Get the App
                                <ArrowRight className="w-5 h-5" />
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== Footer ===== */}
            <footer className="px-6 md:px-12 py-10 border-t border-white/50">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-5">
                    <div className="flex items-center gap-2.5">
                        <Image src="/logo.png" alt="AyuLink" width={30} height={30} className="rounded-lg" />
                        <span className="text-sm font-bold text-primary-dark">AyuLink</span>
                    </div>
                    <a
                        href="https://github.com/sasindumal/AyuLink"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-primary-dark transition-colors"
                    >
                        <Github className="w-4 h-4" />
                        Source on GitHub
                    </a>
                    <p className="text-xs text-text-muted">
                        © {new Date().getFullYear()} AyuLink Digital Healthcare. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
