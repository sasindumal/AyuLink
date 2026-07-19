-- ==============================================
-- AyuLink - Supabase Schema
-- Run via `supabase db push` or paste into the
-- Supabase Dashboard SQL Editor.
-- ==============================================

-- ----- Enums -----

create type "Role" as enum ('PATIENT', 'DOCTOR', 'PHARMACIST');

create type "PrescriptionStatus" as enum (
    'NOT_DISPENSED',
    'PARTIALLY_DISPENSED',
    'FULLY_DISPENSED'
);

-- ----- Tables -----

create table "User" (
    "id"           text primary key default gen_random_uuid()::text,
    "nicNumber"    text not null unique,
    "firstName"    text not null,
    "lastName"     text not null,
    "mobileNumber" text not null,
    "dob"          timestamptz not null,
    "passwordHash" text not null,
    "role"         "Role" not null default 'PATIENT',
    -- Patients are auto-verified; doctors and pharmacists must be
    -- verified manually (set to true in the Supabase dashboard)
    -- before they can issue or dispense prescriptions.
    "verified"     boolean not null default false,
    "medicalId"    text not null unique default gen_random_uuid()::text,
    "createdAt"    timestamptz not null default now(),
    "updatedAt"    timestamptz not null default now()
);

create table "DoctorProfile" (
    "id"             text primary key default gen_random_uuid()::text,
    "userId"         text not null unique,
    "slmcRegNo"      text not null unique,
    "specialization" text not null,
    "hospitalName"   text not null,

    constraint "DoctorProfile_userId_fkey"
        foreign key ("userId") references "User" ("id") on delete cascade
);

create table "PharmacyProfile" (
    "id"              text primary key default gen_random_uuid()::text,
    "userId"          text not null unique,
    "pharmacyName"    text not null,
    "licenseNumber"   text not null unique,
    "pharmacyAddress" text not null,

    constraint "PharmacyProfile_userId_fkey"
        foreign key ("userId") references "User" ("id") on delete cascade
);

create table "Prescription" (
    "id"         text primary key default gen_random_uuid()::text,
    "patientId"  text not null,
    "doctorId"   text not null,
    "dateIssued" timestamptz not null default now(),
    "diagnosis"  text not null,
    "status"     "PrescriptionStatus" not null default 'NOT_DISPENSED',
    "createdAt"  timestamptz not null default now(),
    "updatedAt"  timestamptz not null default now(),

    constraint "Prescription_patientId_fkey"
        foreign key ("patientId") references "User" ("id"),
    constraint "Prescription_doctorId_fkey"
        foreign key ("doctorId") references "User" ("id")
);

create table "PrescriptionItem" (
    "id"             text primary key default gen_random_uuid()::text,
    "prescriptionId" text not null,
    "drugName"       text not null,
    "dosage"         text not null,
    "frequency"      text not null,
    "duration"       text not null,
    "instructions"   text not null default '',
    "dispensed"      boolean not null default false,
    "dispensedAt"    timestamptz,
    "dispensedById"  text,

    constraint "PrescriptionItem_prescriptionId_fkey"
        foreign key ("prescriptionId") references "Prescription" ("id") on delete cascade,
    constraint "PrescriptionItem_dispensedById_fkey"
        foreign key ("dispensedById") references "User" ("id")
);

-- ----- Indexes -----

create index "Prescription_patientId_idx" on "Prescription" ("patientId");
create index "Prescription_doctorId_idx" on "Prescription" ("doctorId");
create index "PrescriptionItem_prescriptionId_idx" on "PrescriptionItem" ("prescriptionId");
create index "PrescriptionItem_dispensedById_idx" on "PrescriptionItem" ("dispensedById");

-- ----- updatedAt trigger -----

create or replace function set_updated_at()
returns trigger as $$
begin
    new."updatedAt" = now();
    return new;
end;
$$ language plpgsql;

create trigger "User_updatedAt"
    before update on "User"
    for each row execute function set_updated_at();

create trigger "Prescription_updatedAt"
    before update on "Prescription"
    for each row execute function set_updated_at();

-- ----- Transactional functions (called via supabase.rpc) -----
-- Multi-table writes go through these so they are atomic; the
-- supabase-js client cannot open transactions on its own.

-- Create a user together with an optional doctor/pharmacy profile.
create or replace function create_user_with_profile(
    p_user jsonb,
    p_doctor jsonb default null,
    p_pharmacy jsonb default null
) returns "User" as $$
declare
    v_user "User";
begin
    insert into "User" (
        "nicNumber", "firstName", "lastName", "mobileNumber",
        "dob", "passwordHash", "role", "verified"
    )
    values (
        p_user->>'nicNumber',
        p_user->>'firstName',
        p_user->>'lastName',
        p_user->>'mobileNumber',
        (p_user->>'dob')::timestamptz,
        p_user->>'passwordHash',
        (p_user->>'role')::"Role",
        (p_user->>'role')::"Role" = 'PATIENT'
    )
    returning * into v_user;

    if p_doctor is not null then
        insert into "DoctorProfile" ("userId", "slmcRegNo", "specialization", "hospitalName")
        values (
            v_user."id",
            p_doctor->>'slmcRegNo',
            p_doctor->>'specialization',
            p_doctor->>'hospitalName'
        );
    end if;

    if p_pharmacy is not null then
        insert into "PharmacyProfile" ("userId", "pharmacyName", "licenseNumber", "pharmacyAddress")
        values (
            v_user."id",
            p_pharmacy->>'pharmacyName',
            p_pharmacy->>'licenseNumber',
            p_pharmacy->>'pharmacyAddress'
        );
    end if;

    return v_user;
end;
$$ language plpgsql;

-- Create a prescription with its items in one transaction.
create or replace function create_prescription_with_items(
    p_patient_id text,
    p_doctor_id text,
    p_diagnosis text,
    p_items jsonb
) returns text as $$
declare
    v_id text;
    item jsonb;
begin
    insert into "Prescription" ("patientId", "doctorId", "diagnosis")
    values (p_patient_id, p_doctor_id, p_diagnosis)
    returning "id" into v_id;

    for item in select * from jsonb_array_elements(p_items) loop
        insert into "PrescriptionItem" (
            "prescriptionId", "drugName", "dosage", "frequency", "duration", "instructions"
        )
        values (
            v_id,
            item->>'drugName',
            item->>'dosage',
            item->>'frequency',
            item->>'duration',
            coalesce(item->>'instructions', '')
        );
    end loop;

    return v_id;
end;
$$ language plpgsql;

-- Dispense or revert one item and recompute the prescription status
-- atomically. Locks the prescription row so concurrent dispenses
-- cannot compute a stale status.
create or replace function dispense_prescription_item(
    p_prescription_id text,
    p_item_id text,
    p_dispensed boolean,
    p_pharmacist_id text
) returns jsonb as $$
declare
    v_item "PrescriptionItem";
    v_all boolean;
    v_any boolean;
    v_status "PrescriptionStatus";
begin
    perform 1 from "Prescription" where "id" = p_prescription_id for update;
    if not found then
        raise exception 'PRESCRIPTION_NOT_FOUND';
    end if;

    select * into v_item
    from "PrescriptionItem"
    where "id" = p_item_id and "prescriptionId" = p_prescription_id
    for update;

    if not found then
        raise exception 'ITEM_NOT_FOUND';
    end if;

    if not p_dispensed then
        if not v_item."dispensed" or v_item."dispensedAt" is null then
            raise exception 'NOT_DISPENSED';
        end if;
        if v_item."dispensedAt" < now() - interval '15 minutes' then
            raise exception 'REVERT_WINDOW_EXPIRED';
        end if;
    end if;

    update "PrescriptionItem" set
        "dispensed"     = p_dispensed,
        "dispensedAt"   = case when p_dispensed then now() else null end,
        "dispensedById" = case when p_dispensed then p_pharmacist_id else null end
    where "id" = p_item_id
    returning * into v_item;

    select bool_and("dispensed"), bool_or("dispensed")
    into v_all, v_any
    from "PrescriptionItem"
    where "prescriptionId" = p_prescription_id;

    v_status := case
        when v_all then 'FULLY_DISPENSED'
        when v_any then 'PARTIALLY_DISPENSED'
        else 'NOT_DISPENSED'
    end;

    update "Prescription" set "status" = v_status where "id" = p_prescription_id;

    return jsonb_build_object(
        'itemId', v_item."id",
        'drugName', v_item."drugName",
        'allDispensed', v_all
    );
end;
$$ language plpgsql;

-- ----- Row Level Security -----
-- All access goes through Next.js API routes using the
-- service role key (which bypasses RLS). Enabling RLS with
-- no policies blocks direct access with the anon key.

alter table "User" enable row level security;
alter table "DoctorProfile" enable row level security;
alter table "PharmacyProfile" enable row level security;
alter table "Prescription" enable row level security;
alter table "PrescriptionItem" enable row level security;
