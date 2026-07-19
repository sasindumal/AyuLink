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

-- ----- Row Level Security -----
-- All access goes through Next.js API routes using the
-- service role key (which bypasses RLS). Enabling RLS with
-- no policies blocks direct access with the anon key.

alter table "User" enable row level security;
alter table "DoctorProfile" enable row level security;
alter table "PharmacyProfile" enable row level security;
alter table "Prescription" enable row level security;
alter table "PrescriptionItem" enable row level security;
