// ==============================================
// AyuLink Patient - Prescription history export
//
// Builds a CSV of every medication ever prescribed to the signed-in
// patient and hands it to the OS share sheet, so it can be saved to
// Files/Drive, emailed to a doctor abroad, or opened in a spreadsheet.
//
// One row per MEDICATION, not per prescription: a prescription with
// three drugs becomes three rows carrying the same prescription id. That
// is the shape a spreadsheet can actually filter and pivot — one row per
// prescription would need the drugs crammed into a single cell.
// ==============================================

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { rpc } from "./api";

export interface ExportRow {
    prescriptionId: string;
    dateIssued: string;
    diagnosis: string;
    status: string;
    expiresAt: string | null;
    doctorName: string;
    doctorSlmc: string | null;
    specialty: string | null;
    drugName: string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    route: string | null;
    instructions: string | null;
    dispensed: boolean;
    dispensedAt: string | null;
    pharmacyName: string | null;
}

const COLUMNS: { key: keyof ExportRow; header: string }[] = [
    { key: "dateIssued", header: "Date Issued" },
    { key: "diagnosis", header: "Diagnosis" },
    { key: "doctorName", header: "Doctor" },
    { key: "doctorSlmc", header: "SLMC No" },
    { key: "specialty", header: "Specialty" },
    { key: "drugName", header: "Medication" },
    { key: "dosage", header: "Dosage" },
    { key: "frequency", header: "Frequency" },
    { key: "duration", header: "Duration" },
    { key: "route", header: "Route" },
    { key: "instructions", header: "Instructions" },
    { key: "status", header: "Prescription Status" },
    { key: "dispensed", header: "Dispensed" },
    { key: "dispensedAt", header: "Dispensed At" },
    { key: "pharmacyName", header: "Pharmacy" },
    { key: "expiresAt", header: "Expires" },
    { key: "prescriptionId", header: "Prescription ID" },
];

/** RFC 4180 escaping. Quotes are doubled and the whole field wrapped
 *  whenever it contains a comma, quote or newline — prescription
 *  instructions routinely contain commas ("1-2 tablets, after meals"),
 *  which would otherwise shift every later column by one. */
function csvCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    const s = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: ExportRow[]): string {
    const header = COLUMNS.map((c) => csvCell(c.header)).join(",");
    const body = rows.map((r) => COLUMNS.map((c) => csvCell(r[c.key])).join(","));
    // \r\n, and a leading UTF-8 BOM below: Excel on Windows otherwise
    // renders any non-ASCII (a Sinhala instruction, a doctor's name) as
    // mojibake, and treats bare \n inconsistently.
    return [header, ...body].join("\r\n");
}

export interface ExportResult {
    rowCount: number;
    fileName: string;
    shared: boolean;
}

export async function exportPrescriptionsCsv(): Promise<ExportResult> {
    const rows = await rpc<ExportRow[]>("app_export_my_prescriptions");
    if (!rows || rows.length === 0) {
        throw new Error("You don't have any prescriptions to export yet.");
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `ayulink-prescriptions-${stamp}.csv`;
    const uri = `${FileSystem.Paths.cache.uri}${fileName}`;

    const file = new FileSystem.File(uri);
    if (file.exists) file.delete();
    file.create();
    file.write(`﻿${rowsToCsv(rows)}`);

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
        await Sharing.shareAsync(uri, {
            mimeType: "text/csv",
            dialogTitle: "Prescription history",
            UTI: "public.comma-separated-values-text",
        });
    }

    return { rowCount: rows.length, fileName, shared: canShare };
}
