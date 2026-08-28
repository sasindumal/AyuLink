"""
AyuLink — Postgres Bulk Dataset Seeder
=======================================

Reads the same Dataset_ref/ CSVs as seed_neo4j.py and bulk-creates
real, bookable Doctor and ChannelingCenter accounts in Postgres —
generating a SQL file (not executing directly) so it can be applied
the same way every other migration/seed in this repo is applied
(`supabase db query --linked -f <file>`).

It also generates a fixed pool of 30 mock Pharmacy accounts (there is
no pharmacy CSV in Dataset_ref/, unlike doctors/centers) so every role
is loginable for demos, and writes demo_credentials.csv next to this
script listing EVERY seeded login (the hand-written demo accounts, all
bulk doctors, all bulk centers, and the 30 pharmacies) — NIC / license
and the shared password. That CSV is gitignored; regenerate it by
re-running this script.

Run AFTER supabase/seed.sql and supabase/seed_appointments.sql, so
the hand-written demo accounts (fixed UUIDs) are unaffected — this
script generates its own deterministic UUIDs (uuid5, distinct
namespace) and cannot collide with those.

Only Doctors Master Dataset.csv, Master Channeling Centres
Registry.csv, and Specialist Channelling Timeslots and Tariffs
Dataset.csv are used — there is no Postgres table for the
disease/symptom/specialty-taxonomy CSVs (those stay Neo4j-only).

Usage:
    python backend/src/agent_workflow/ingestion/seed_postgres_dataset.py
    supabase db query --linked -f backend/src/agent_workflow/ingestion/seed_postgres_dataset.sql
"""

import csv
import re
import uuid
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DATASET_DIR = PROJECT_ROOT / "Dataset_ref"
OUT_FILE = Path(__file__).resolve().parent / "seed_postgres_dataset.sql"
CREDENTIALS_CSV = Path(__file__).resolve().parent / "demo_credentials.csv"

NAMESPACE = uuid.UUID("6f1c2e2a-6b2b-4e3a-9c1d-8a2f3b4c5d6e")
DEMO_PASSWORD = "password123"
PASSWORD_HASH_EXPR = f"crypt('{DEMO_PASSWORD}', gen_salt('bf'))"

# How many mock pharmacies to generate. No pharmacy CSV exists in
# Dataset_ref/, so this pool is synthesised here (see build_pharmacies).
PHARMACY_COUNT = 30

# The hand-written demo accounts from supabase/seed.sql and
# supabase/seed_appointments.sql — not created here (their fixed UUIDs
# are), but listed in demo_credentials.csv so it's the single complete
# reference for a demo. Columns match _cred_row().
FIXED_DEMO_CREDS = [
    ("PATIENT", "Kasun Jayawardena", "NIC", "200012345678",
     "AYU-200012345678", "supabase/seed.sql"),
    ("DOCTOR", "Amal Perera", "NIC", "199812345678",
     "AYU-199812345678", "SLMC-12345 · Cardiology · supabase/seed.sql"),
    ("PHARMACIST", "Nimal Fernando", "NIC or License", "199512345678 / PL-2024-001",
     "AYU-199512345678", "MediCare Pharmacy · supabase/seed.sql"),
    ("CHANNELING_CENTER", "Colombo Central Channeling Center", "NIC", "199012345678",
     "AYU-199012345678", "Colombo · supabase/seed_appointments.sql"),
    ("CHANNELING_CENTER", "Kandy Wellness Channeling Center", "NIC", "199112345678",
     "AYU-199112345678", "Kandy · supabase/seed_appointments.sql"),
]


def read_csv(filename: str) -> list[dict]:
    with open(DATASET_DIR / filename, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def sql_str(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def doctor_uuid(slmc_id: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"doctor:{slmc_id}"))


def center_uuid(name: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"center:{name}"))


def pharmacy_uuid(license_no: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"pharmacy:{license_no}"))


_NIC_PREFIX = {"doctor": "1", "center": "2", "pharmacy": "3"}


def synthetic_nic(kind: str, index: int) -> str:
    # 12-digit synthetic NIC, matching the User table's NIC regex.
    # "1" doctors, "2" centers, "3" pharmacies — keeps the pools disjoint.
    return f"{_NIC_PREFIX[kind]}9{index:010d}"


def _cred_row(role, name, login_type, login_value, medical_id, notes):
    """One row for demo_credentials.csv. Password is always DEMO_PASSWORD."""
    return (role, name, login_type, login_value, DEMO_PASSWORD, medical_id, notes)


# ---- Mock pharmacies (no source CSV — synthesised) -------------------
PHARMACY_CITIES = [
    ("Colombo", 79.8612, 6.9271), ("Dehiwala", 79.8636, 6.8510),
    ("Moratuwa", 79.8816, 6.7730), ("Negombo", 79.8358, 7.2083),
    ("Kandy", 80.6337, 7.2906), ("Galle", 80.2170, 6.0535),
    ("Matara", 80.5353, 5.9485), ("Kurunegala", 80.3647, 7.4863),
    ("Jaffna", 80.0255, 9.6615), ("Anuradhapura", 80.4037, 8.3114),
    ("Batticaloa", 81.7000, 7.7170), ("Trincomalee", 81.2335, 8.5874),
    ("Ratnapura", 80.4037, 6.6828), ("Badulla", 81.0550, 6.9934),
    ("Kalutara", 79.9607, 6.5854),
]
PHARMACY_BRANDS = [
    "MediCare", "HealthGuard", "CityCare", "LifeLine", "WellPharma",
    "GreenCross", "CarePlus", "PrimeMed", "Nova", "Sunrise",
]
PHARMACY_OWNERS = [
    ("Nimali", "Fernando"), ("Kamal", "Perera"), ("Sunil", "Bandara"),
    ("Anoma", "Silva"), ("Ruwan", "Jayasuriya"), ("Dilani", "Wickramasinghe"),
    ("Chaminda", "Gunawardena"), ("Priya", "Rajapaksa"),
    ("Lakmal", "Dissanayake"), ("Sanduni", "Ekanayake"),
]


def build_pharmacies(count: int = PHARMACY_COUNT) -> list[dict]:
    out = []
    for i in range(count):
        city, lng, lat = PHARMACY_CITIES[i % len(PHARMACY_CITIES)]
        brand = PHARMACY_BRANDS[i % len(PHARMACY_BRANDS)]
        first, last = PHARMACY_OWNERS[i % len(PHARMACY_OWNERS)]
        # deterministic jitter so two pharmacies in one city aren't stacked
        jitter = (i // len(PHARMACY_CITIES)) * 0.012
        out.append({
            "name": f"{brand} Pharmacy - {city}",
            # PL-2024-100.. keeps clear of PL-2024-001 (supabase/seed.sql)
            "license": f"PL-2024-{i + 100:03d}",
            "city": city,
            "lng": round(lng + jitter, 4),
            "lat": round(lat + jitter, 4),
            "first": first,
            "last": last,
            "mobile": f"+9478{i:07d}",
        })
    return out


def extract_city(address: str) -> str | None:
    """Best-effort city from the trailing comma segment of an address,
    e.g. 'No. 114, Norris Canal Road, Colombo 10' -> 'Colombo'. Fallback
    for rows with no City column value — the CSV's own City column
    (added for hybrid district/city coverage) is preferred when present."""
    parts = [p.strip() for p in address.split(",") if p.strip()]
    if not parts:
        return None
    last = parts[-1]
    # Strip a trailing postal/zone number, e.g. "Colombo 10" -> "Colombo"
    match = re.match(r"^([A-Za-z .]+?)\s*\d*$", last)
    city = (match.group(1) if match else last).strip()
    return city or None


def parse_time_range(value: str) -> tuple[str, str]:
    """'05:00 PM - 08:00 PM' -> ('17:00', '20:00')"""
    start_raw, end_raw = [p.strip() for p in value.split("-")]
    start = datetime.strptime(start_raw, "%I:%M %p").strftime("%H:%M")
    end = datetime.strptime(end_raw, "%I:%M %p").strftime("%H:%M")
    return start, end


DAY_MAP = {
    "Monday": "MONDAY", "Tuesday": "TUESDAY", "Wednesday": "WEDNESDAY",
    "Thursday": "THURSDAY", "Friday": "FRIDAY", "Saturday": "SATURDAY", "Sunday": "SUNDAY",
}

# One INSERT per row (the original approach) means ~14.7k round trips for a
# dataset this size — over Supabase's pooler that's tens of minutes even
# though each statement is instant. Batching into multi-row VALUES lists
# cuts that to a couple dozen statements without changing what gets written.
BATCH_SIZE = 300


def emit_batched_insert(
    table: str, columns: list[str], rows: list[list[str]], conflict: str, batch_size: int = BATCH_SIZE
) -> list[str]:
    """rows: each row is a list of already-formatted SQL value expressions
    (via sql_str/point()/etc.) — same values every per-row INSERT would have
    used, just grouped into fewer multi-row statements."""
    col_list = ", ".join(columns)
    statements = []
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        values_sql = ", ".join("(" + ", ".join(row) + ")" for row in batch)
        statements.append(f"insert into {table} ({col_list}) values {values_sql} {conflict};")
    return statements


def emit_doctor_specialty_batch(pairs: list[tuple[str, str]], batch_size: int = BATCH_SIZE) -> list[str]:
    """Same case-insensitive name-match logic as the original per-doctor
    `insert ... select ... where lower(trim(name)) = ...`, batched via a
    single VALUES-list join instead of one SELECT per doctor."""
    statements = []
    for i in range(0, len(pairs), batch_size):
        batch = pairs[i : i + batch_size]
        values_sql = ", ".join(f"({sql_str(doc_id)}::uuid, {sql_str(specialty)})" for doc_id, specialty in batch)
        statements.append(
            'insert into "DoctorSpecialty" ("doctor_id", "specialty_id") '
            f"select v.doctor_id, sp.\"id\" from (values {values_sql}) as v(doctor_id, specialty_name) "
            'join "Specialty" sp on lower(trim(sp."name")) = lower(trim(v.specialty_name)) '
            "on conflict do nothing;"
        )
    return statements


def main() -> None:
    doctors = read_csv("Doctors Master Dataset.csv")
    centers = read_csv("Master Channeling Centres Registry.csv")
    timeslots = read_csv("Specialist Channelling Timeslots and Tariffs Dataset.csv")

    pharmacies = build_pharmacies()

    doctor_id_by_slmc: dict[str, str] = {}
    center_id_by_name: dict[str, str] = {}
    # Every login this run creates, for demo_credentials.csv (written at
    # the end). Seeded with the fixed hand-written demo accounts.
    cred_rows: list[tuple] = [_cred_row(*row) for row in FIXED_DEMO_CREDS]

    lines: list[str] = [
        "-- Auto-generated by backend/src/agent_workflow/ingestion/seed_postgres_dataset.py",
        "-- Bulk-imports Dataset_ref/ doctors + channeling centers, 30 mock",
        "-- pharmacies, and doctor schedules into Postgres. Idempotent — every",
        "-- insert uses a deterministic uuid5 id with `on conflict do nothing`.",
        "begin;",
        "",
    ]

    # ----- Doctors -----
    lines.append("-- ===== Doctors =====")
    auth_users_rows: list[list[str]] = []
    auth_identities_rows: list[list[str]] = []
    user_rows: list[list[str]] = []
    doctor_profile_rows: list[list[str]] = []
    doctor_specialty_pairs: list[tuple[str, str]] = []

    for i, row in enumerate(doctors):
        slmc_id = row["SLMC_ID"].strip()
        doc_id = doctor_uuid(slmc_id)
        doctor_id_by_slmc[slmc_id] = doc_id
        nic = synthetic_nic("doctor", i)
        email = f"{nic}@nic.ayulink.app"
        first_name = row["First_Name"].strip()
        last_name = row["Last_Name"].strip()
        specialty = row["Specialty"].strip()
        rating = row["Rating"].strip() or "null"
        mobile = f"+9477{i:07d}"

        auth_users_rows.append([
            "'00000000-0000-0000-0000-000000000000'", f"{sql_str(doc_id)}::uuid", "'authenticated'",
            "'authenticated'", sql_str(email), PASSWORD_HASH_EXPR, "now()",
            '\'{"provider":"email","providers":["email"]}\'::jsonb', "'{}'::jsonb", "now()", "now()",
            "''", "''", "''", "''", "''",
        ])
        auth_identities_rows.append([
            "gen_random_uuid()", f"{sql_str(doc_id)}::uuid", sql_str(doc_id), "'email'",
            f"jsonb_build_object('sub', {sql_str(doc_id)}, 'email', {sql_str(email)}, "
            f"'email_verified', true, 'phone_verified', false)",
            "now()", "now()", "now()",
        ])
        user_rows.append([
            f"{sql_str(doc_id)}::uuid", sql_str(nic), sql_str(first_name), sql_str(last_name),
            sql_str(mobile), "'1980-01-01'", "'DOCTOR'", "true", sql_str("AYU-" + nic),
        ])
        doctor_profile_rows.append([
            f"{sql_str(doc_id)}::uuid", sql_str(slmc_id), sql_str(specialty), rating,
        ])
        doctor_specialty_pairs.append((doc_id, specialty))
        cred_rows.append(_cred_row(
            "DOCTOR", f"{first_name} {last_name}".strip(), "NIC", nic,
            "AYU-" + nic, f"SLMC {slmc_id} · {specialty}",
        ))

    lines += emit_batched_insert(
        "auth.users",
        ["instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
         "raw_app_meta_data", "raw_user_meta_data", "created_at", "updated_at", "confirmation_token",
         "recovery_token", "email_change", "email_change_token_new", "email_change_token_current"],
        auth_users_rows, "on conflict (id) do nothing",
    )
    lines += emit_batched_insert(
        "auth.identities",
        ["id", "user_id", "provider_id", "provider", "identity_data", "last_sign_in_at", "created_at", "updated_at"],
        auth_identities_rows, "on conflict do nothing",
    )
    lines += emit_batched_insert(
        '"User"',
        ['"id"', '"nicNumber"', '"firstName"', '"lastName"', '"mobileNumber"', '"dob"', '"role"', '"verified"', '"medicalId"'],
        user_rows, 'on conflict ("id") do nothing',
    )
    lines += emit_batched_insert(
        '"DoctorProfile"',
        ['"user_id"', '"slmc_id"', '"specialty"', '"rating"'],
        doctor_profile_rows, "on conflict do nothing",
    )
    # Links into the canonical "Specialty" table by case-insensitive name
    # match — app_search_doctors/app_search_doctor_slots filter through
    # "DoctorSpecialty", not the free-text DoctorProfile.specialty column,
    # so without this a bulk-seeded doctor is invisible to specialty search.
    lines += emit_doctor_specialty_batch(doctor_specialty_pairs)
    lines.append("")

    # ----- Channeling centers -----
    lines.append("-- ===== Channeling centers =====")
    cc_auth_users_rows: list[list[str]] = []
    cc_auth_identities_rows: list[list[str]] = []
    cc_user_rows: list[list[str]] = []
    channeling_center_rows: list[list[str]] = []

    for i, row in enumerate(centers):
        name = row["Name"].strip()
        cc_id = center_uuid(name)
        center_id_by_name[name] = cc_id
        nic = synthetic_nic("center", i)
        email = f"{nic}@nic.ayulink.app"
        address = row["Address"].strip()
        contact = row["Contact_Number"].strip()
        lat = row["Latitude"].strip()
        lng = row["Longitude"].strip()
        city = (row.get("City") or "").strip() or extract_city(address)

        cc_auth_users_rows.append([
            "'00000000-0000-0000-0000-000000000000'", f"{sql_str(cc_id)}::uuid", "'authenticated'",
            "'authenticated'", sql_str(email), PASSWORD_HASH_EXPR, "now()",
            '\'{"provider":"email","providers":["email"]}\'::jsonb', "'{}'::jsonb", "now()", "now()",
            "''", "''", "''", "''", "''",
        ])
        cc_auth_identities_rows.append([
            "gen_random_uuid()", f"{sql_str(cc_id)}::uuid", sql_str(cc_id), "'email'",
            f"jsonb_build_object('sub', {sql_str(cc_id)}, 'email', {sql_str(email)}, "
            f"'email_verified', true, 'phone_verified', false)",
            "now()", "now()", "now()",
        ])
        cc_user_rows.append([
            f"{sql_str(cc_id)}::uuid", sql_str(nic), sql_str(name), "'Channeling Center'",
            sql_str(contact), "'1990-01-01'", "'CHANNELING_CENTER'", "true", sql_str("AYU-" + nic),
        ])
        channeling_center_rows.append([
            f"{sql_str(cc_id)}::uuid", f"{sql_str(cc_id)}::uuid", sql_str(name), sql_str(address),
            sql_str(contact), f"point({lng}, {lat})", sql_str(city),
        ])
        cred_rows.append(_cred_row(
            "CHANNELING_CENTER", name, "NIC", nic, "AYU-" + nic, city or "",
        ))

    lines += emit_batched_insert(
        "auth.users",
        ["instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
         "raw_app_meta_data", "raw_user_meta_data", "created_at", "updated_at", "confirmation_token",
         "recovery_token", "email_change", "email_change_token_new", "email_change_token_current"],
        cc_auth_users_rows, "on conflict (id) do nothing",
    )
    lines += emit_batched_insert(
        "auth.identities",
        ["id", "user_id", "provider_id", "provider", "identity_data", "last_sign_in_at", "created_at", "updated_at"],
        cc_auth_identities_rows, "on conflict do nothing",
    )
    lines += emit_batched_insert(
        '"User"',
        ['"id"', '"nicNumber"', '"firstName"', '"lastName"', '"mobileNumber"', '"dob"', '"role"', '"verified"', '"medicalId"'],
        cc_user_rows, 'on conflict ("id") do nothing',
    )
    lines += emit_batched_insert(
        '"ChannelingCenter"',
        ['"id"', '"user_id"', '"name"', '"address"', '"contact_number"', '"location"', '"city"'],
        channeling_center_rows, 'on conflict ("id") do nothing',
    )
    lines.append("")

    # ----- Mock pharmacies -----
    # No source CSV — a fixed pool (build_pharmacies) so every role has
    # loginable demo accounts. Same auth.users/auth.identities/User shape
    # as doctors and centers; PharmacyProfile.location always has real
    # coordinates here (the optional-coords default only applies to the
    # in-app registration form).
    lines.append("-- ===== Mock pharmacies =====")
    ph_auth_users_rows: list[list[str]] = []
    ph_auth_identities_rows: list[list[str]] = []
    ph_user_rows: list[list[str]] = []
    pharmacy_profile_rows: list[list[str]] = []

    for i, ph in enumerate(pharmacies):
        ph_id = pharmacy_uuid(ph["license"])
        nic = synthetic_nic("pharmacy", i)
        email = f"{nic}@nic.ayulink.app"

        ph_auth_users_rows.append([
            "'00000000-0000-0000-0000-000000000000'", f"{sql_str(ph_id)}::uuid", "'authenticated'",
            "'authenticated'", sql_str(email), PASSWORD_HASH_EXPR, "now()",
            '\'{"provider":"email","providers":["email"]}\'::jsonb', "'{}'::jsonb", "now()", "now()",
            "''", "''", "''", "''", "''",
        ])
        ph_auth_identities_rows.append([
            "gen_random_uuid()", f"{sql_str(ph_id)}::uuid", sql_str(ph_id), "'email'",
            f"jsonb_build_object('sub', {sql_str(ph_id)}, 'email', {sql_str(email)}, "
            f"'email_verified', true, 'phone_verified', false)",
            "now()", "now()", "now()",
        ])
        ph_user_rows.append([
            f"{sql_str(ph_id)}::uuid", sql_str(nic), sql_str(ph["first"]), sql_str(ph["last"]),
            sql_str(ph["mobile"]), "'1985-01-01'", "'PHARMACIST'", "true", sql_str("AYU-" + nic),
        ])
        pharmacy_profile_rows.append([
            f"{sql_str(ph_id)}::uuid", sql_str(ph["name"]), sql_str(ph["license"]),
            f"point({ph['lng']}, {ph['lat']})",
        ])
        cred_rows.append(_cred_row(
            "PHARMACIST", ph["name"], "NIC or License", f"{nic} / {ph['license']}",
            "AYU-" + nic, ph["city"],
        ))

    lines += emit_batched_insert(
        "auth.users",
        ["instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
         "raw_app_meta_data", "raw_user_meta_data", "created_at", "updated_at", "confirmation_token",
         "recovery_token", "email_change", "email_change_token_new", "email_change_token_current"],
        ph_auth_users_rows, "on conflict (id) do nothing",
    )
    lines += emit_batched_insert(
        "auth.identities",
        ["id", "user_id", "provider_id", "provider", "identity_data", "last_sign_in_at", "created_at", "updated_at"],
        ph_auth_identities_rows, "on conflict do nothing",
    )
    lines += emit_batched_insert(
        '"User"',
        ['"id"', '"nicNumber"', '"firstName"', '"lastName"', '"mobileNumber"', '"dob"', '"role"', '"verified"', '"medicalId"'],
        ph_user_rows, 'on conflict ("id") do nothing',
    )
    lines += emit_batched_insert(
        '"PharmacyProfile"',
        ['"userId"', '"pharmacyName"', '"licenseNumber"', '"location"'],
        pharmacy_profile_rows, 'on conflict ("userId") do nothing',
    )
    lines.append("")

    # ----- Doctor schedules -----
    lines.append("-- ===== Doctor schedules =====")
    seen: set[tuple[str, str, str, str]] = set()
    skipped = 0
    schedule_rows: list[list[str]] = []
    for row in timeslots:
        slmc_id = row["Doctor_SLMC_ID"].strip()
        center_name = row["Channeling_Center_Name"].strip()
        doc_id = doctor_id_by_slmc.get(slmc_id)
        cc_id = center_id_by_name.get(center_name)
        if not doc_id or not cc_id:
            skipped += 1
            continue

        start, end = parse_time_range(row["Available_Time"].strip())
        days = [d.strip() for d in row["Available_Days"].split(",") if d.strip()]
        for day in days:
            day_enum = DAY_MAP.get(day)
            if not day_enum:
                skipped += 1
                continue
            key = (doc_id, cc_id, day_enum, start)
            if key in seen:
                skipped += 1
                continue
            seen.add(key)
            schedule_rows.append([
                f"{sql_str(doc_id)}::uuid", f"{sql_str(cc_id)}::uuid", sql_str(day_enum), f"'{start}'", f"'{end}'",
            ])

    written = len(schedule_rows)
    lines += emit_batched_insert(
        '"DoctorSchedule"',
        ['"doctor_id"', '"channeling_center_id"', '"day_of_week"', '"start_time"', '"end_time"'],
        schedule_rows, "on conflict do nothing",
    )

    lines.append("")
    lines.append("commit;")

    OUT_FILE.write_text("\n".join(lines) + "\n")

    with open(CREDENTIALS_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            ["role", "name", "login_type", "login_value", "password", "medical_id", "notes"]
        )
        writer.writerows(cred_rows)

    print(f"Doctors: {len(doctors)}  Centers: {len(centers)}  Pharmacies: {len(pharmacies)}")
    print(f"DoctorSchedule rows written: {written}  skipped (dup/unmatched): {skipped}")
    print(f"Wrote {OUT_FILE}")
    print(f"Wrote {CREDENTIALS_CSV}  ({len(cred_rows)} credentials, password '{DEMO_PASSWORD}')")


if __name__ == "__main__":
    main()
