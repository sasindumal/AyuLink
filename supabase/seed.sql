-- ==============================================
-- AyuLink - Demo Data Seed
-- Creates 3 demo accounts (password: password123)
-- and 2 sample prescriptions.
--
-- Run AFTER the init migration, in the Supabase
-- SQL Editor. Idempotent — safe to re-run.
--
-- Demo logins:
--   Patient     NIC 200012345678   Medical ID AYU-200012345678
--   Doctor      NIC 199812345678
--   Pharmacist  NIC 199512345678 (or license PL-2024-001)
-- ==============================================

-- ----- 1. Auth accounts -----
-- GoTrue-compatible rows; email = <nic>@nic.ayulink.app,
-- password bcrypt-hashed via pgcrypto.

insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current
)
select
    '00000000-0000-0000-0000-000000000000',
    u.id, 'authenticated', 'authenticated', u.email,
    crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(),
    '', '', '', '', ''
from (values
    ('a0000000-0000-4000-8000-000000000001'::uuid, '200012345678@nic.ayulink.app'),
    ('a0000000-0000-4000-8000-000000000002'::uuid, '199812345678@nic.ayulink.app'),
    ('a0000000-0000-4000-8000-000000000003'::uuid, '199512345678@nic.ayulink.app')
) as u(id, email)
on conflict (id) do nothing;

insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
)
select
    gen_random_uuid(), u.id, u.id::text, 'email',
    jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
    ),
    now(), now(), now()
from (values
    ('a0000000-0000-4000-8000-000000000001'::uuid, '200012345678@nic.ayulink.app'),
    ('a0000000-0000-4000-8000-000000000002'::uuid, '199812345678@nic.ayulink.app'),
    ('a0000000-0000-4000-8000-000000000003'::uuid, '199512345678@nic.ayulink.app')
) as u(id, email)
on conflict do nothing;

-- ----- 2. Profiles (all pre-verified) -----

insert into "User" (
    "id", "nicNumber", "firstName", "lastName", "mobileNumber",
    "dob", "role", "verified", "medicalId"
) values
    ('a0000000-0000-4000-8000-000000000001', '200012345678', 'Sasindu', 'Malhara',
     '0771234567', '2000-05-15', 'PATIENT', true, 'AYU-200012345678'),
    ('a0000000-0000-4000-8000-000000000002', '199812345678', 'Amal', 'Perera',
     '0779876543', '1998-03-22', 'DOCTOR', true, 'AYU-199812345678'),
    ('a0000000-0000-4000-8000-000000000003', '199512345678', 'Nimal', 'Fernando',
     '0765551234', '1995-11-08', 'PHARMACIST', true, 'AYU-199512345678')
on conflict ("id") do nothing;

insert into "DoctorProfile" ("user_id", "slmc_id", "specialty", "rating")
values ('a0000000-0000-4000-8000-000000000002', 'SLMC-12345', 'Cardiology', 4.8)
on conflict ("user_id") do nothing;

insert into "PharmacyProfile" ("userId", "pharmacyName", "licenseNumber", "pharmacyAddress")
values ('a0000000-0000-4000-8000-000000000003', 'MediCare Pharmacy', 'PL-2024-001', '45 Galle Road, Colombo 03')
on conflict ("userId") do nothing;

-- ----- 3. Sample prescriptions -----

insert into "Prescription" ("id", "patientId", "doctorId", "diagnosis", "status", "dateIssued") values
    ('b0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
     'Upper Respiratory Tract Infection', 'NOT_DISPENSED', now()),
    ('b0000000-0000-4000-8000-000000000002',
     'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
     'Hypertension Management', 'FULLY_DISPENSED', now() - interval '7 days')
on conflict ("id") do nothing;

insert into "PrescriptionItem" (
    "id", "prescriptionId", "drugName", "dosage", "frequency", "duration",
    "instructions", "dispensed", "dispensedAt", "dispensedById"
) values
    ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
     'Amoxicillin 500mg', '1 capsule', 'Three times daily', '7 days',
     'Take after meals with a full glass of water', false, null, null),
    ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
     'Paracetamol 500mg', '1–2 tablets', 'Every 6 hours', '5 days',
     'Take as needed for fever or pain', false, null, null),
    ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
     'Cetirizine 10mg', '1 tablet', 'Once daily', '5 days',
     'Take at bedtime. May cause drowsiness', false, null, null),
    ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002',
     'Amlodipine 5mg', '1 tablet', 'Once daily', '30 days',
     'Take in the morning. Monitor blood pressure regularly',
     true, now() - interval '7 days', 'a0000000-0000-4000-8000-000000000003'),
    ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002',
     'Losartan 50mg', '1 tablet', 'Once daily', '30 days',
     'Take in the evening. Avoid potassium supplements',
     true, now() - interval '7 days', 'a0000000-0000-4000-8000-000000000003')
on conflict ("id") do nothing;

-- Done. Sign in with NIC 200012345678 / password123 (patient),
-- 199812345678 (doctor), or 199512345678 / PL-2024-001 (pharmacy).
