-- ==============================================
-- AyuLink - Expose Channeling Center Coordinates on Appointments
--
-- Additive on top of 20260822010000_city_and_browse.sql. The patient
-- app already fetches the device's own GPS coordinates for "nearest"
-- doctor search (app_search_doctor_slots), but appointment_json()
-- never surfaced the *channeling center's* coordinates — only its
-- address as plain text — so there was no way to open a booked
-- appointment's location in a map app. "ChannelingCenter"."location"
-- is a Postgres point (location[0] = lng, location[1] = lat, same
-- convention app_search_doctor_slots already uses).
--
-- Run via `supabase db push` or paste into the SQL Editor, same as
-- prior migrations.
-- ==============================================

create or replace function appointment_json(a "Appointment")
returns jsonb
language sql stable security definer set search_path = public as $$
    select to_jsonb(a) || jsonb_build_object(
        'patient', (
            select jsonb_build_object(
                'id', u."id", 'firstName', u."firstName", 'lastName', u."lastName",
                'mobileNumber', u."mobileNumber", 'medicalId', u."medicalId"
            ) from "User" u where u."id" = a."patient_id"
        ),
        'doctor', (
            select jsonb_build_object(
                'id', u."id", 'firstName', u."firstName", 'lastName', u."lastName",
                'specialty', dp."specialty", 'rating', dp."rating"
            )
            from "User" u
            left join "DoctorProfile" dp on dp."user_id" = u."id"
            where u."id" = a."doctor_id"
        ),
        'channelingCenter', (
            select jsonb_build_object(
                'id', cc."id", 'name', cc."name", 'address', cc."address",
                'city', cc."city", 'contactNumber', cc."contact_number",
                'latitude', cc."location"[1], 'longitude', cc."location"[0]
            ) from "ChannelingCenter" cc where cc."id" = a."channeling_center_id"
        )
    )
$$;
