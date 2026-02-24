// ==============================================
// AyuLink - NextAuth.js Configuration
// Credentials-based auth using NIC Number + Password
// ==============================================

import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "AyuLink",
            credentials: {
                nicNumber: { label: "NIC Number", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.nicNumber || !credentials?.password) {
                    throw new Error("Please enter your NIC number and password");
                }

                // Find user by NIC number
                const user = await prisma.user.findUnique({
                    where: { nicNumber: credentials.nicNumber },
                    include: { doctorProfile: true },
                });

                if (!user) {
                    throw new Error("No account found with this NIC number");
                }

                // Verify password
                const isValid = await bcrypt.compare(
                    credentials.password,
                    user.passwordHash
                );

                if (!isValid) {
                    throw new Error("Invalid password");
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
