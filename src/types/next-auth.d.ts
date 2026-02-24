// ==============================================
// AyuLink - NextAuth Type Extensions
// Extend default NextAuth types with custom fields
// ==============================================

import "next-auth";
import { Role } from "@prisma/client";

declare module "next-auth" {
    interface User {
        id: string;
        nicNumber: string;
        firstName: string;
        lastName: string;
        role: Role;
        medicalId: string;
    }

    interface Session {
        user: {
            id: string;
            nicNumber: string;
            firstName: string;
            lastName: string;
            role: Role;
            medicalId: string;
            email?: string | null;
            name?: string | null;
            image?: string | null;
        };
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        role: Role;
        medicalId: string;
        firstName: string;
        lastName: string;
        nicNumber: string;
    }
}
