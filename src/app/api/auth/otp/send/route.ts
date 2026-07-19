// ==============================================
// AyuLink - Mobile OTP: Send Code
// POST /api/auth/otp/send { mobileNumber }
// Issues a 6-digit code valid for 10 minutes.
// In non-production the code is returned in the
// response (devCode) since no SMS gateway is wired.
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const MOBILE_REGEX = /^\+?[0-9]{9,15}$/;

// Wire a real SMS provider (e.g. Twilio, Notify.lk, Dialog SMS API) here.
async function sendSms(mobileNumber: string, code: string) {
    console.log(`[AyuLink OTP] ${mobileNumber} -> ${code}`);
}

export async function POST(req: NextRequest) {
    try {
        const { mobileNumber } = (await req.json()) ?? {};

        if (typeof mobileNumber !== "string" || !MOBILE_REGEX.test(mobileNumber.trim())) {
            return NextResponse.json(
                { error: "Please enter a valid mobile number" },
                { status: 400 }
            );
        }
        const mobile = mobileNumber.trim();

        const ip = clientIp(req.headers);
        if (
            !rateLimit(`otp-send:${ip}`, 8, 15 * 60 * 1000) ||
            !rateLimit(`otp-send:${mobile}`, 3, 10 * 60 * 1000)
        ) {
            return NextResponse.json(
                { error: "Too many codes requested. Please try again later" },
                { status: 429 }
            );
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const codeHash = await bcrypt.hash(code, 8);

        // A fresh code replaces any previous codes for this number
        await supabase.from("MobileOtp").delete().eq("mobileNumber", mobile);

        const { error } = await supabase.from("MobileOtp").insert({
            mobileNumber: mobile,
            codeHash,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        if (error) throw error;

        await sendSms(mobile, code);

        return NextResponse.json({
            message: "Verification code sent",
            // Exposed only in development — no SMS gateway is configured
            ...(process.env.NODE_ENV !== "production" && { devCode: code }),
        });
    } catch (error) {
        console.error("OTP send error:", error);
        return NextResponse.json(
            { error: "Failed to send verification code" },
            { status: 500 }
        );
    }
}
