// ==============================================
// AyuLink - Multi-Step Registration Page
// Step 1: Role selection
// Step 2: Personal details
// Step 3: Doctor-specific (conditional)
// Step 4: Password creation
// ==============================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowRight,
    ArrowLeft,
    User,
    Stethoscope,
    Pill,
    Check,
    Eye,
    EyeOff,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "PATIENT" | "DOCTOR" | "PHARMACIST";

interface FormData {
    role: Role;
    nicNumber: string;
    firstName: string;
    lastName: string;
    mobileNumber: string;
    dob: string;
    password: string;
    confirmPassword: string;
    // Doctor-specific
    slmcRegNo: string;
    specialization: string;
    hospitalName: string;
}

const roleOptions = [
    {
        value: "PATIENT" as Role,
        label: "Patient",
        description: "Access your digital medical records and prescriptions",
        icon: User,
        color: "bg-blue-50 border-blue-200 text-blue-600",
        activeColor: "bg-primary-action/10 border-primary-action text-primary-action",
    },
    {
        value: "DOCTOR" as Role,
        label: "Doctor",
        description: "Issue digital prescriptions and manage patients",
        icon: Stethoscope,
        color: "bg-emerald-50 border-emerald-200 text-emerald-600",
        activeColor: "bg-primary-action/10 border-primary-action text-primary-action",
    },
    {
        value: "PHARMACIST" as Role,
        label: "Pharmacist",
        description: "Scan prescriptions and dispense medication",
        icon: Pill,
        color: "bg-amber-50 border-amber-200 text-amber-600",
        activeColor: "bg-primary-action/10 border-primary-action text-primary-action",
    },
];

export default function RegisterPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const [formData, setFormData] = useState<FormData>({
        role: "PATIENT",
        nicNumber: "",
        firstName: "",
        lastName: "",
        mobileNumber: "",
        dob: "",
        password: "",
        confirmPassword: "",
        slmcRegNo: "",
        specialization: "",
        hospitalName: "",
    });

    // Determine total steps based on role
    const totalSteps = formData.role === "DOCTOR" ? 4 : 3;

    const updateForm = (field: keyof FormData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        setError("");
    };

    const validateStep = (): boolean => {
        switch (step) {
            case 1:
                return !!formData.role;
            case 2:
                if (!formData.nicNumber || !formData.firstName || !formData.lastName || !formData.mobileNumber || !formData.dob) {
                    setError("All fields are required");
                    return false;
                }
                return true;
            case 3:
                if (formData.role === "DOCTOR") {
                    if (!formData.slmcRegNo || !formData.specialization || !formData.hospitalName) {
                        setError("All doctor details are required");
                        return false;
                    }
                    return true;
                }
                // Password step for non-doctors
                return validatePassword();
            case 4:
                return validatePassword();
            default:
                return true;
        }
    };

    const validatePassword = (): boolean => {
        if (formData.password.length < 8) {
            setError("Password must be at least 8 characters");
            return false;
        }
        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match");
            return false;
        }
        return true;
    };

    const nextStep = () => {
        if (validateStep()) {
            setStep((s) => s + 1);
            setError("");
        }
    };

    const prevStep = () => {
        setStep((s) => s - 1);
        setError("");
    };

    const handleSubmit = async () => {
        if (!validateStep()) return;

        setIsLoading(true);
        setError("");

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Registration failed");
                return;
            }

            // Redirect to login on success
            router.push("/login?registered=true");
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const isLastStep = step === totalSteps;

    return (
        <div className="min-h-screen bg-background flex">
            {/* Left Panel - Decorative */}
            <div className="hidden lg:flex lg:w-2/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-dark via-[#1a5016] to-[#0d3a0a]" />
                <div className="absolute top-20 -left-20 w-96 h-96 rounded-full bg-primary-action/10 blur-3xl" />
                <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-accent-warning/10 blur-3xl" />
                <div
                    className="absolute inset-0 opacity-5"
                    style={{
                        backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                        backgroundSize: "40px 40px",
                    }}
                />

                <div className="relative z-10 flex flex-col justify-center px-12 text-white">
                    <Image
                        src="/logo.png"
                        alt="AyuLink"
                        width={64}
                        height={64}
                        className="rounded-2xl shadow-2xl mb-8"
                    />
                    <h2 className="text-4xl font-bold leading-tight mb-4">
                        Join the future
                        <br />
                        of <span className="text-primary-action">Healthcare</span>
                    </h2>
                    <p className="text-white/60 text-lg">
                        Create your AyuLink account and experience seamless digital prescriptions.
                    </p>

                    {/* Step indicator */}
                    <div className="mt-12 space-y-3">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "flex items-center gap-3 text-sm",
                                    i + 1 <= step ? "text-white" : "text-white/30"
                                )}
                            >
                                <div
                                    className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border",
                                        i + 1 < step
                                            ? "bg-primary-action border-primary-action"
                                            : i + 1 === step
                                                ? "border-primary-action text-primary-action"
                                                : "border-white/20"
                                    )}
                                >
                                    {i + 1 < step ? <Check className="w-4 h-4" /> : i + 1}
                                </div>
                                <span>
                                    {i === 0
                                        ? "Select Role"
                                        : i === 1
                                            ? "Personal Details"
                                            : formData.role === "DOCTOR" && i === 2
                                                ? "Professional Info"
                                                : "Create Password"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Panel - Form */}
            <div className="flex-1 flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-lg animate-fade-in">
                    {/* Mobile logo */}
                    <div className="lg:hidden flex items-center gap-3 mb-8">
                        <Image src="/logo.png" alt="AyuLink" width={44} height={44} className="rounded-xl" />
                        <h1 className="text-xl font-bold text-primary-dark">AyuLink</h1>
                    </div>

                    {/* Progress bar (mobile) */}
                    <div className="lg:hidden mb-8">
                        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                            <span>Step {step} of {totalSteps}</span>
                            <span>{Math.round((step / totalSteps) * 100)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-border overflow-hidden">
                            <div
                                className="h-full rounded-full bg-primary-action transition-all duration-500"
                                style={{ width: `${(step / totalSteps) * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm animate-slide-up">
                            {error}
                        </div>
                    )}

                    {/* ===== STEP 1: Role Selection ===== */}
                    {step === 1 && (
                        <div className="animate-slide-up">
                            <h2 className="text-2xl font-bold text-primary-dark mb-2">
                                I am a...
                            </h2>
                            <p className="text-text-muted mb-8">
                                Choose the role that best describes you
                            </p>

                            <div className="space-y-4">
                                {roleOptions.map((option) => {
                                    const Icon = option.icon;
                                    const isSelected = formData.role === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => updateForm("role", option.value)}
                                            className={cn(
                                                "w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all duration-200 text-left",
                                                isSelected
                                                    ? "border-primary-action bg-primary-action/5 shadow-md"
                                                    : "border-border hover:border-primary-action/30 hover:bg-background"
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "p-3 rounded-xl",
                                                    isSelected ? "bg-primary-action/10" : "bg-background"
                                                )}
                                            >
                                                <Icon
                                                    className={cn(
                                                        "w-6 h-6",
                                                        isSelected ? "text-primary-action" : "text-text-muted"
                                                    )}
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-semibold text-primary-dark">
                                                    {option.label}
                                                </p>
                                                <p className="text-sm text-text-muted mt-0.5">
                                                    {option.description}
                                                </p>
                                            </div>
                                            {isSelected && (
                                                <div className="w-6 h-6 rounded-full bg-primary-action flex items-center justify-center">
                                                    <Check className="w-4 h-4 text-white" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ===== STEP 2: Personal Details ===== */}
                    {step === 2 && (
                        <div className="animate-slide-up">
                            <h2 className="text-2xl font-bold text-primary-dark mb-2">
                                Personal Details
                            </h2>
                            <p className="text-text-muted mb-8">
                                Tell us about yourself
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-primary-dark mb-2">
                                        NIC Number
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.nicNumber}
                                        onChange={(e) => updateForm("nicNumber", e.target.value)}
                                        placeholder="e.g., 200012345678"
                                        className="input-field"
                                        autoFocus
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-primary-dark mb-2">
                                            First Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.firstName}
                                            onChange={(e) => updateForm("firstName", e.target.value)}
                                            placeholder="First name"
                                            className="input-field"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-primary-dark mb-2">
                                            Last Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.lastName}
                                            onChange={(e) => updateForm("lastName", e.target.value)}
                                            placeholder="Last name"
                                            className="input-field"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-primary-dark mb-2">
                                        Mobile Number
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.mobileNumber}
                                        onChange={(e) => updateForm("mobileNumber", e.target.value)}
                                        placeholder="e.g., 0771234567"
                                        className="input-field"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-primary-dark mb-2">
                                        Date of Birth
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.dob}
                                        onChange={(e) => updateForm("dob", e.target.value)}
                                        className="input-field"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ===== STEP 3 (Doctor only): Professional Details ===== */}
                    {step === 3 && formData.role === "DOCTOR" && (
                        <div className="animate-slide-up">
                            <h2 className="text-2xl font-bold text-primary-dark mb-2">
                                Professional Details
                            </h2>
                            <p className="text-text-muted mb-8">
                                Verify your medical credentials
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-primary-dark mb-2">
                                        SLMC Registration Number
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.slmcRegNo}
                                        onChange={(e) => updateForm("slmcRegNo", e.target.value)}
                                        placeholder="Enter your SLMC number"
                                        className="input-field"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-primary-dark mb-2">
                                        Specialization
                                    </label>
                                    <select
                                        value={formData.specialization}
                                        onChange={(e) => updateForm("specialization", e.target.value)}
                                        className="input-field"
                                    >
                                        <option value="">Select specialization</option>
                                        <option value="General Practice">General Practice</option>
                                        <option value="Cardiology">Cardiology</option>
                                        <option value="Dermatology">Dermatology</option>
                                        <option value="ENT">ENT</option>
                                        <option value="Gastroenterology">Gastroenterology</option>
                                        <option value="Neurology">Neurology</option>
                                        <option value="Oncology">Oncology</option>
                                        <option value="Ophthalmology">Ophthalmology</option>
                                        <option value="Orthopedics">Orthopedics</option>
                                        <option value="Pediatrics">Pediatrics</option>
                                        <option value="Psychiatry">Psychiatry</option>
                                        <option value="Radiology">Radiology</option>
                                        <option value="Surgery">Surgery</option>
                                        <option value="Urology">Urology</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-primary-dark mb-2">
                                        Hospital / Clinic Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.hospitalName}
                                        onChange={(e) => updateForm("hospitalName", e.target.value)}
                                        placeholder="e.g., National Hospital Colombo"
                                        className="input-field"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ===== PASSWORD STEP (last step for all roles) ===== */}
                    {((step === 3 && formData.role !== "DOCTOR") || step === 4) && (
                        <div className="animate-slide-up">
                            <h2 className="text-2xl font-bold text-primary-dark mb-2">
                                Create Password
                            </h2>
                            <p className="text-text-muted mb-8">
                                Secure your account with a strong password
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-primary-dark mb-2">
                                        Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={formData.password}
                                            onChange={(e) => updateForm("password", e.target.value)}
                                            placeholder="At least 8 characters"
                                            className="input-field pr-12"
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-primary-dark mb-2">
                                        Confirm Password
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.confirmPassword}
                                        onChange={(e) => updateForm("confirmPassword", e.target.value)}
                                        placeholder="Re-enter your password"
                                        className="input-field"
                                    />
                                </div>

                                {/* Password strength indicator */}
                                {formData.password && (
                                    <div className="space-y-2">
                                        <div className="flex gap-1">
                                            {[1, 2, 3, 4].map((i) => (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "h-1.5 flex-1 rounded-full transition-colors",
                                                        formData.password.length >= i * 3
                                                            ? formData.password.length >= 12
                                                                ? "bg-primary-action"
                                                                : "bg-accent-warning"
                                                            : "bg-border"
                                                    )}
                                                />
                                            ))}
                                        </div>
                                        <p className="text-xs text-text-muted">
                                            {formData.password.length < 8
                                                ? "Too short"
                                                : formData.password.length < 12
                                                    ? "Good"
                                                    : "Strong"}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex items-center justify-between mt-10">
                        {step > 1 ? (
                            <button
                                type="button"
                                onClick={prevStep}
                                className="btn-secondary flex items-center gap-2"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </button>
                        ) : (
                            <div />
                        )}

                        {isLastStep ? (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isLoading}
                                className="btn-primary flex items-center gap-2 disabled:opacity-60"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <span>Create Account</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={nextStep}
                                className="btn-primary flex items-center gap-2"
                            >
                                <span>Continue</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Login Link */}
                    <p className="text-center text-sm text-text-muted mt-8">
                        Already have an account?{" "}
                        <Link
                            href="/login"
                            className="text-primary-action font-semibold hover:underline"
                        >
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
