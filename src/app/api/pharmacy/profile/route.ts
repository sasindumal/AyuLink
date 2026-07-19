// ==============================================
// AyuLink - Pharmacy Profile API
// GET /api/pharmacy/profile - Fetch pharmacy info
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuthUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
    try {
        const user = await getAuthUser(req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (user.role !== "PHARMACIST") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { data: pharmacyProfile, error } = await supabase
            .from("PharmacyProfile")
            .select("*")
            .eq("userId", user.id)
            .maybeSingle();
        if (error) throw error;

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
