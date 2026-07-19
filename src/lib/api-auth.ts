// ==============================================
// AyuLink - API Authentication Helper
// Resolves the calling user from either:
//  1. A Bearer JWT (mobile apps, issued by /api/mobile/login)
//  2. The NextAuth session cookie (web app)
// ==============================================

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { SignJWT, jwtVerify } from "jose";
import { authOptions } from "@/lib/auth";
import { Role } from "@/types/db";
import type { AuthUser } from "@/lib/credentials";

const MOBILE_TOKEN_TTL = "30d";

function secretKey(): Uint8Array {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
    return new TextEncoder().encode(secret);
}

/** Issue a signed Bearer token for a mobile client. */
export async function signMobileToken(user: AuthUser): Promise<string> {
    return await new SignJWT({
        id: user.id,
        role: user.role,
        medicalId: user.medicalId,
        firstName: user.firstName,
        lastName: user.lastName,
        nicNumber: user.nicNumber,
    })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(MOBILE_TOKEN_TTL)
        .sign(secretKey());
}

/**
 * Resolve the authenticated user for an API request.
 * A Bearer token (mobile) takes precedence; otherwise falls back to the
 * NextAuth cookie session (web). Returns null when unauthenticated.
 */
export async function getAuthUser(req?: NextRequest): Promise<AuthUser | null> {
    const header = req?.headers.get("authorization");

    if (header?.toLowerCase().startsWith("bearer ")) {
        try {
            const { payload } = await jwtVerify(header.slice(7).trim(), secretKey());
            if (typeof payload.id !== "string" || typeof payload.role !== "string") {
                return null;
            }
            return {
                id: payload.id,
                role: payload.role as Role,
                medicalId: String(payload.medicalId ?? ""),
                firstName: String(payload.firstName ?? ""),
                lastName: String(payload.lastName ?? ""),
                nicNumber: String(payload.nicNumber ?? ""),
            };
        } catch {
            // Invalid or expired token — the client explicitly attempted
            // token auth, so do not fall back to the cookie session
            return null;
        }
    }

    const session = await getServerSession(authOptions);
    return (session?.user as AuthUser | undefined) ?? null;
}
