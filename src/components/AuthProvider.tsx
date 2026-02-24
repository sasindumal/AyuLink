// ==============================================
// AyuLink - Session Provider (Client Component)
// Wraps the app with NextAuth SessionProvider
// ==============================================

"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

export default function AuthProvider({ children }: { children: ReactNode }) {
    return <SessionProvider>{children}</SessionProvider>;
}
