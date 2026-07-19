// ==============================================
// AyuLink - Mobile OTP: Verify Code
// POST /api/auth/otp/verify { mobileNumber, code }
// Marks the number verified for 15 minutes so
// registration can complete.
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
    try {
        const { mobileNumber, code } = (await req.json()) ?? {};

        if (typeof mobileNumber !== "string" || typeof code !== "string") {
            return NextResponse.json(
                { error: "Mobile number and code are required" },
                { status: 400 }
            );
        }
        const mobile = mobileNumber.trim();

        const ip = clientIp(req.headers);
        if (!rateLimit(`otp-verify:${ip}:${mobile}`, 6, 10 * 60 * 1000)) {
            return NextResponse.json(
                { error: "Too many attempts. Please request a new code" },
                { status: 429 }
            );
        }

        const { data: otp } = await supabase
            .from("MobileOtp")
            .select("*")
            .eq("mobileNumber", mobile)
            .gt("expiresAt", new Date().toISOString())
            .order("createdAt", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!otp || !(await bcrypt.compare(code.trim(), otp.codeHash))) {
            return NextResponse.json(
                { error: "Invalid or expired code" },
                { status: 400 }
            );
        }

        // Mark verified and give registration a 15-minute window to complete
        const { error } = await supabase
            .from("MobileOtp")
            .update({
                verifiedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            })
            .eq("id", otp.id);
        if (error) throw error;

        return NextResponse.json({ message: "Mobile number verified" });
    } catch (error) {
        console.error("OTP verify error:", error);
        return NextResponse.json(
            { error: "Failed to verify code" },
            { status: 500 }
        );
    }
}
