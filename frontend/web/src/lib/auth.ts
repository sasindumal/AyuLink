// ==============================================
// AyuLink - NextAuth.js Configuration
// Supports NIC login (patients/doctors) and
// License Number login (pharmacies)
// ==============================================

import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyCredentials } from "@/lib/credentials";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "AyuLink",
            credentials: {
                nicNumber: { label: "NIC Number", type: "text" },
                licenseNumber: { label: "License Number", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials, req) {
                if (!credentials?.password) {
                    throw new Error("Please enter your password");
                }

                // Determine login method
                const hasNic = !!credentials.nicNumber;
                const hasLicense = !!credentials.licenseNumber;

                if (!hasNic && !hasLicense) {
                    throw new Error("Please enter your NIC number or License Number");
                }

                // Throttle attempts per IP + identifier
                const identifier = credentials.nicNumber || credentials.licenseNumber;
                const ip = clientIp(req?.headers ?? {});
                if (!rateLimit(`login:${ip}:${identifier}`, 5, 15 * 60 * 1000)) {
                    throw new Error("Too many login attempts. Please try again in 15 minutes");
                }

                // Shared with /api/mobile/login; throws a single generic
                // "Invalid credentials" error on any failure
                return await verifyCredentials(
                    credentials.nicNumber,
                    credentials.licenseNumber,
                    credentials.password
                );
            },
        }),
    ],

    // Use JWT strategy for serverless compatibility
    session: {
        strategy: "jwt",
        maxAge: 24 * 60 * 60, // 24 hours
    },

    callbacks: {
        // Include custom fields in the JWT token
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = (user as any).role;
                token.medicalId = (user as any).medicalId;
                token.firstName = (user as any).firstName;
                token.lastName = (user as any).lastName;
                token.nicNumber = (user as any).nicNumber;
            }
            return token;
        },

        // Make custom fields available in the session
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).id = token.id;
                (session.user as any).role = token.role;
                (session.user as any).medicalId = token.medicalId;
                (session.user as any).firstName = token.firstName;
                (session.user as any).lastName = token.lastName;
                (session.user as any).nicNumber = token.nicNumber;
            }
            return session;
        },
    },

    pages: {
        signIn: "/login",
        error: "/login",
    },

    secret: process.env.NEXTAUTH_SECRET,
};
