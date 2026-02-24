// ==============================================
// AyuLink - Ultra-Modern Split-Screen Login Page
// Left: Branded gradient with logo | Right: Login form
// ==============================================

"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, ArrowRight, Shield, Heart, Zap } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const [nicNumber, setNicNumber] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            const result = await signIn("credentials", {
                nicNumber,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError(result.error);
            } else {
                // Fetch session to determine role for redirect
                const res = await fetch("/api/auth/session");
                const session = await res.json();
                const role = session?.user?.role;

                if (role === "DOCTOR") {
                    router.push("/doctor/dashboard");
                } else if (role === "PHARMACIST") {
                    router.push("/pharmacy/dashboard");
                } else {
                    router.push("/patient/dashboard");
                }
            }
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex">
            {/* ===== LEFT SIDE: Branded Panel ===== */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
                {/* Gradient Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary-dark via-[#1a5016] to-[#0d3a0a]" />

                {/* Decorative circles */}
                <div className="absolute top-20 -left-20 w-96 h-96 rounded-full bg-primary-action/10 blur-3xl" />
                <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-accent-warning/10 blur-3xl" />
                <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-primary-action/5 blur-2xl" />

                {/* Grid pattern overlay */}
                <div
                    className="absolute inset-0 opacity-5"
                    style={{
                        backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                        backgroundSize: "40px 40px",
                    }}
                />

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-center px-16 text-white">
                    {/* Logo */}
                    <div className="mb-12">
                        <Image
                            src="/logo.png"
                            alt="AyuLink"
                            width={80}
                            height={80}
                            className="rounded-2xl shadow-2xl"
                        />
                    </div>

                    <h2 className="text-5xl font-bold leading-tight mb-6">
                        Your Health,
                        <br />
                        <span className="text-primary-action">Digitally</span> Connected
                    </h2>

                    <p className="text-lg text-white/70 max-w-md mb-12">
                        Replace paper prescriptions with secure digital records.
                        One scan connects you to your entire medical history.
                    </p>

                    {/* Feature cards */}
                    <div className="space-y-4">
                        {[
                            { icon: Shield, text: "Secure & encrypted medical records" },
                            { icon: Heart, text: "Instant access to prescription history" },
                            { icon: Zap, text: "Quick QR-based verification" },
                        ].map(({ icon: Icon, text }, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10"
                            >
                                <div className="p-2 rounded-xl bg-primary-action/20">
                                    <Icon className="w-5 h-5 text-primary-action" />
                                </div>
                                <span className="text-sm text-white/80">{text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ===== RIGHT SIDE: Login Form ===== */}
            <div className="flex-1 flex items-center justify-center px-6 py-12 bg-background">
                <div className="w-full max-w-md animate-fade-in">
                    {/* Mobile logo */}
                    <div className="lg:hidden flex items-center gap-3 mb-10">
                        <Image
                            src="/logo.png"
                            alt="AyuLink"
                            width={48}
                            height={48}
                            className="rounded-xl"
                        />
                        <h1 className="text-2xl font-bold text-primary-dark">AyuLink</h1>
                    </div>

                    {/* Form Header */}
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold text-primary-dark">Welcome back</h2>
                        <p className="text-text-muted mt-2">
                            Sign in to your AyuLink account
                        </p>
                    </div>

                    {/* Error Alert */}
                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm animate-slide-up">
                            {error}
                        </div>
                    )}

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* NIC Number Field */}
                        <div>
                            <label
                                htmlFor="nicNumber"
                                className="block text-sm font-semibold text-primary-dark mb-2"
                            >
                                NIC Number
                            </label>
                            <input
                                id="nicNumber"
                                type="text"
                                value={nicNumber}
                                onChange={(e) => setNicNumber(e.target.value)}
                                placeholder="Enter your NIC number"
                                className="input-field"
                                required
                                autoFocus
                            />
                        </div>

                        {/* Password Field */}
                        <div>
                            <label
                                htmlFor="password"
                                className="block text-sm font-semibold text-primary-dark mb-2"
                            >
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    className="input-field pr-12"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary-dark transition-colors"
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-5 h-5" />
                                    ) : (
                                        <Eye className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-primary w-full flex items-center justify-center gap-2 text-base disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>Sign In</span>
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Register Link */}
                    <p className="text-center text-sm text-text-muted mt-8">
                        Don&apos;t have an account?{" "}
                        <Link
                            href="/register"
                            className="text-primary-action font-semibold hover:underline"
                        >
                            Create one here
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
