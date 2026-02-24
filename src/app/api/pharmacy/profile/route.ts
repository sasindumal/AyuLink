// ==============================================
// AyuLink - Pharmacy Profile API
// GET /api/pharmacy/profile - Fetch pharmacy info
// ==============================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if ((session.user as any).role !== "PHARMACIST") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const pharmacyProfile = await prisma.pharmacyProfile.findUnique({
            where: { userId: (session.user as any).id },
        });

        if (!pharmacyProfile) {
            return NextResponse.json({ error: "Pharmacy profile not found" }, { status: 404 });
        }

        return NextResponse.json({ pharmacyProfile });
    } catch (error) {
        console.error("Fetch pharmacy profile error:", error);
        return NextResponse.json(
            { error: "Failed to fetch pharmacy profile" },
            { status: 500 }
        );
    }
}
