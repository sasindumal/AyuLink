-- ==============================================
-- AyuLink - Demo Appointment-Booking Data
-- Adds 2 demo channeling centers (different districts,
-- so district/nearest search has something to filter),
-- 2 recurring DoctorSchedule slots for the existing demo
-- doctor, and 1 demo Appointment for the existing demo
-- patient.
--
-- Run AFTER seed.sql, in the Supabase SQL Editor.
-- Idempotent — safe to re-run. The demo Appointment's date
-- is computed relative to "today" each time this runs, so
-- re-running on a different day will NOT move an
-- already-inserted appointment (its fixed id already
-- exists, so the insert is a no-op) — only relevant for a
-- from-scratch first run.
--
-- Demo channeling center logins (password: password123):
--   Colombo Central   NIC 199012345678
--   Kandy Wellness     NIC 199112345678
-- ==============================================

-- ----- 1. Auth accounts for the 2 demo channeling centers -----

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
    ('a0000000-0000-4000-8000-000000000004'::uuid, '199012345678@nic.ayulink.app'),
    ('a0000000-0000-4000-8000-000000000005'::uuid, '199112345678@nic.ayulink.app')
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
    ('a0000000-0000-4000-8000-000000000004'::uuid, '199012345678@nic.ayulink.app'),
    ('a0000000-0000-4000-8000-000000000005'::uuid, '199112345678@nic.ayulink.app')
) as u(id, email)
on conflict do nothing;

-- ----- 2. User + ChannelingCenter profiles (pre-verified) -----

insert into "User" (
    "id", "nicNumber", "firstName", "lastName", "mobileNumber",
    "dob", "role", "verified", "medicalId"
) values
    ('a0000000-0000-4000-8000-000000000004', '199012345678', 'Colombo Central', 'Channeling Center',
     '0112345001', '1990-01-01', 'CHANNELING_CENTER', true, 'AYU-199012345678'),
    ('a0000000-0000-4000-8000-000000000005', '199112345678', 'Kandy Wellness', 'Channeling Center',
     '0812345001', '1991-01-01', 'CHANNELING_CENTER', true, 'AYU-199112345678')
on conflict ("id") do nothing;

insert into "ChannelingCenter" ("id", "user_id", "name", "address", "contact_number", "location", "district")
values
    ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004',
     'Colombo Central Channeling Center', '100 Galle Road, Colombo 03', '+94112345001',
     point(79.8475, 6.9101), 'Colombo'),
    ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000005',
     'Kandy Wellness Channeling Center', '25 Peradeniya Road, Kandy', '+94812345001',
     point(80.6337, 7.2906), 'Kandy')
on conflict ("id") do nothing;

-- ----- 3. Recurring DoctorSchedule slots for the demo doctor -----
-- (demo doctor: a0000000-0000-4000-8000-000000000002, Amal Perera / Cardiology)

insert into "DoctorSchedule" ("id", "doctor_id", "channeling_center_id", "day_of_week", "start_time", "end_time")
values
    ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
     'c0000000-0000-4000-8000-000000000001', 'MONDAY', '09:00', '13:00'),
    ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
     'c0000000-0000-4000-8000-000000000002', 'WEDNESDAY', '14:00', '17:00')
on conflict ("id") do nothing;

-- ----- 4. One demo Appointment -----
-- Demo patient (a0000000-...-000000000001) booked with the demo
-- doctor at Colombo Central, on the next upcoming Monday.

insert into "Appointment" (
    "id", "patient_id", "doctor_id", "channeling_center_id", "doctor_schedule_id",
    "appointment_date", "start_time", "end_time", "status", "reason"
)
select
    'e0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    (current_date + ((7 + 1 - extract(isodow from current_date)::int) % 7) * interval '1 day')::date,
    '09:00', '13:00', 'BOOKED', 'Routine follow-up'
on conflict ("id") do nothing;
