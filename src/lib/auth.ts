// ==============================================
// AyuLink - NextAuth.js Configuration
// Supports NIC login (patients/doctors) and
// License Number login (pharmacies)
// ==============================================

import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// One generic message for every credential failure so responses
// don't reveal whether an NIC / license number is registered.
const INVALID_CREDENTIALS = "Invalid credentials";

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

                let user;

                if (hasLicense) {
                    // Pharmacy login via license number
                    const { data: pharmacyProfile } = await supabase
                        .from("PharmacyProfile")
                        .select("*, user:User(*)")
                        .eq("licenseNumber", credentials.licenseNumber)
                        .maybeSingle();

                    if (!pharmacyProfile?.user) {
                        throw new Error(INVALID_CREDENTIALS);
                    }

                    user = pharmacyProfile.user;
                } else {
                    // Patient / Doctor login via NIC
                    const { data } = await supabase
                        .from("User")
                        .select("*")
                        .eq("nicNumber", credentials.nicNumber)
                        .maybeSingle();

                    if (!data) {
                        throw new Error(INVALID_CREDENTIALS);
                    }

                    user = data;
                }

                // Verify password
                const isValid = await bcrypt.compare(
                    credentials.password,
                    user.passwordHash
                );

                if (!isValid) {
                    throw new Error(INVALID_CREDENTIALS);
                }

                // Return user data (will be available in JWT)
                return {
                    id: user.id,
                    nicNumber: user.nicNumber,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    medicalId: user.medicalId,
                };
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
