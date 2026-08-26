// ==============================================
// AyuLink - Mobile Login API
// POST /api/mobile/login
// Verifies credentials and returns a signed JWT
// for the React Native apps (Authorization: Bearer)
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/credentials";
import { signMobileToken } from "@/lib/api-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { nicNumber, licenseNumber, password } = body ?? {};

        if (!password || (!nicNumber && !licenseNumber)) {
            return NextResponse.json(
                { error: "NIC number (or license number) and password are required" },
                { status: 400 }
            );
        }

        const identifier = nicNumber || licenseNumber;
        const ip = clientIp(req.headers);
        if (!rateLimit(`login:${ip}:${identifier}`, 5, 15 * 60 * 1000)) {
            return NextResponse.json(
                { error: "Too many login attempts. Please try again in 15 minutes" },
                { status: 429 }
            );
        }

        const user = await verifyCredentials(nicNumber, licenseNumber, password);
        const token = await signMobileToken(user);

        return NextResponse.json({ token, user });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Login failed" },
            { status: 401 }
        );
    }
}
