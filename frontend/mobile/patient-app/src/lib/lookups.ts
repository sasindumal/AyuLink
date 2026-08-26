// ==============================================
// AyuLink Patient - Lookup Lists
// Canonical specialty / city lists for the search
// filter pickers, fetched once and cached in memory
// for the life of the app session.
// ==============================================

import { useEffect, useState } from "react";
import { rpc } from "./api";

interface Specialty {
    id: string;
    name: string;
}

let specialtiesCache: string[] | null = null;
let citiesCache: string[] | null = null;
let inFlight: Promise<void> | null = null;

async function loadLookups(): Promise<void> {
    if (specialtiesCache && citiesCache) return;
    if (inFlight) return inFlight;
    inFlight = (async () => {
        const [specialties, cities] = await Promise.all([
            rpc<Specialty[]>("app_list_specialties").catch(() => []),
            rpc<string[]>("app_list_cities").catch(() => []),
        ]);
        specialtiesCache = (specialties ?? []).map((s) => s.name);
        citiesCache = (cities ?? []).filter(Boolean);
    })();
    await inFlight;
    inFlight = null;
}

export function useLookups(): { specialties: string[]; cities: string[] } {
    const [specialties, setSpecialties] = useState<string[]>(specialtiesCache ?? []);
    const [cities, setCities] = useState<string[]>(citiesCache ?? []);

    useEffect(() => {
        let cancelled = false;
        loadLookups().then(() => {
            if (cancelled) return;
            setSpecialties(specialtiesCache ?? []);
            setCities(citiesCache ?? []);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return { specialties, cities };
}
