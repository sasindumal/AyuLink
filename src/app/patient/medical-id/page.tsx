// ==============================================
// AyuLink - Patient: My Medical ID Page
// Full QR code display, personal info, usage guide
// ==============================================

"use client";

import { useSession } from "next-auth/react";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import {
    IdCard,
    Phone,
    CreditCard,
    Shield,
    Smartphone,
    QrCode,
    Info,
} from "lucide-react";

export default function MedicalIdPage() {
    const { data: session } = useSession();
    const user = session?.user;

    if (!user) return null;

    const fullName = `${user.firstName} ${user.lastName}`;

    return (
        <div className="max-w-5xl mx-auto animate-fade-in">
            {/* Page Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary-dark flex items-center gap-3">
                    My Medical ID
                    <IdCard className="w-8 h-8 text-primary-action" />
                </h1>
                <p className="text-text-muted mt-1">
                    Your unique Digital Medical ID — show this QR code to doctors
                    and pharmacists
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* QR Code Card */}
                <div className="flex justify-center">
                    <QRCodeDisplay
                        medicalId={user.medicalId}
                        patientName={fullName}
                        size={260}
                    />
                </div>

                {/* Personal Information */}
                <div className="space-y-6">
                    <div className="card p-6">
                        <h3 className="text-lg font-bold text-primary-dark mb-4 flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-primary-action" />
                            Personal Information
                        </h3>
                        <div className="space-y-4">
                            <InfoRow
                                icon={<IdCard className="w-4 h-4" />}
                                label="Full Name"
                                value={fullName}
                            />
                            <InfoRow
                                icon={<CreditCard className="w-4 h-4" />}
                                label="NIC Number"
                                value={user.nicNumber}
                            />
                            <InfoRow
                                icon={<QrCode className="w-4 h-4" />}
                                label="Medical ID"
                                value={user.medicalId}
                                mono
                            />
                        </div>
                    </div>

                    {/* How to Use Guide */}
                    <div className="card p-6 border-l-4 border-l-primary-action">
                        <h3 className="text-lg font-bold text-primary-dark mb-4 flex items-center gap-2">
                            <Info className="w-5 h-5 text-primary-action" />
                            How to Use Your Medical ID
                        </h3>
                        <div className="space-y-3">
                            <Step
                                number={1}
                                title="Visit a Doctor"
                                desc="Show your QR code at the clinic. The doctor scans it to access your medical records."
                            />
                            <Step
                                number={2}
                                title="Receive Digital Prescription"
                                desc="Your doctor creates a digital prescription linked to your Medical ID."
                            />
                            <Step
                                number={3}
                                title="Visit a Pharmacy"
                                desc="Show your QR code to the pharmacist. They scan it to find your active prescriptions."
                            />
                            <Step
                                number={4}
                                title="Collect Medication"
                                desc="The pharmacist dispenses your medications and marks the prescription as dispensed."
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Security Notice */}
            <div className="mt-8 card p-5 flex items-start gap-4 bg-primary-action/5">
                <Shield className="w-6 h-6 text-primary-action shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-semibold text-primary-dark">
                        Your data is secure
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                        Your Medical ID QR code only contains your unique
                        identifier — no personal health data. Medical records
                        are securely stored and only accessible by authorized
                        healthcare providers.
                    </p>
                </div>
            </div>
        </div>
    );
}

function InfoRow({
    icon,
    label,
    value,
    mono,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
            <div className="text-text-muted">{icon}</div>
            <div className="flex-1">
                <p className="text-xs text-text-muted">{label}</p>
                <p
                    className={`text-sm font-medium text-primary-dark ${mono ? "font-mono" : ""
                        }`}
                >
                    {value}
                </p>
            </div>
        </div>
    );
}

function Step({
    number,
    title,
    desc,
}: {
    number: number;
    title: string;
    desc: string;
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-primary-action/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary-action">
                    {number}
                </span>
            </div>
            <div>
                <p className="text-sm font-semibold text-primary-dark">
                    {title}
                </p>
                <p className="text-xs text-text-muted">{desc}</p>
            </div>
        </div>
    );
}
