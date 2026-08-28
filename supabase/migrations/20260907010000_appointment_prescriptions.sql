-- ==============================================
-- AyuLink - Appointment-linked prescriptions + follow-up plan
--
-- Requires 20260907000000_treatment_prescribed_status.sql to have run
-- first (it adds the 'PRESCRIBED' TreatmentStatus label this file uses).
--
-- Adds:
--   * "Prescription".appointment_id - the appointment this prescription
--     was issued at. Previously prescriptions and appointments were
--     completely unlinked, and app_create_prescription had to *guess*
--     which Treatment a prescription confirmed ("most recent unconfirmed
--     treatment for this patient whose appointment's doctor is me").
--     That heuristic stays as the fallback for walk-in prescriptions
--     with no appointment, but an explicit link is now preferred.
--   * "Prescription".followup_plan - what the patient should do if the
--     problem persists after finishing the course: nothing in
--     particular, come back to this same doctor, or see a specific
--     other doctor. Drives the end-of-course check-in in the patient's
--     AI chat.
--   * "Prescription".referred_doctor_id - who to see, when
--     followup_plan = 'REFER_DOCTOR'.
--   * app_doctor_appointments_for_patient() - the caller-doctor's own
--     active appointments with one patient, so scanning a patient's QR
--     can show only the appointments that doctor is actually seeing
--     them for.
--   * app_search_referral_doctors() - pick the referred-to doctor.
--
-- Also re-publishes treatment_json() to DROP the derived-COMPLETED
-- behaviour: a Treatment's status is now its own stored column
-- (DIAGNOSED -> BOOKED -> PRESCRIBED -> COMPLETED) and is no longer
-- silently forced to COMPLETED just because its linked appointment was
-- marked completed by the channeling center.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

-- ----- Enums -----

do $$ begin
    create type "PrescriptionFollowupPlan" as enum ('NONE', 'MEET_SAME_DOCTOR', 'REFER_DOCTOR');
exception when duplicate_object then null;
end $$;

-- ----- Schema -----

alter table "Prescription"
    add column if not exists "appointment_id" uuid null,
    add column if not exists "followup_plan" "PrescriptionFollowupPlan" not null default 'NONE',
    add column if not exists "referred_doctor_id" uuid null;

do $$ begin
    alter table "Prescription" add constraint "Prescription_appointment_id_fkey"
        foreign key ("appointment_id") references "Appointment" ("id");
exception when duplicate_object then null;
end $$;

do $$ begin
    alter table "Prescription" add constraint "Prescription_referred_doctor_id_fkey"
        foreign key ("referred_doctor_id") references "User" ("id");
exception when duplicate_object then null;
end $$;

create index if not exists "Prescription_appointment_id_idx"
    on "Prescription" ("appointment_id");

-- ==============================================
-- Internal functions
-- ==============================================

-- Re-published: status is no longer derived from the linked
-- appointment. The stored column (from to_jsonb(t)) is authoritative,
-- so a diagnosis only reaches COMPLETED when something explicitly
-- sets it there — not as a side effect of the channeling center
-- closing out the appointment.
create or replace function treatment_json(t "Treatment")
returns jsonb
language sql stable security definer set search_path = public as $$
    select to_jsonb(t) || jsonb_build_object(
        'disease_name', coalesce(t."confirmed_diagnosis", t."disease_name"),
        'appointment', (
            select jsonb_build_object(
                'id', a."id", 'orderNumber', a."order_number", 'status', a."status",
                'appointmentDate', a."appointment_date", 'startTime', a."start_time"
            ) from "Appointment" a where a."id" = t."appointment_id"
        )
    )
$$;

-- Re-published: exposes the follow-up plan and, when the plan is a
-- referral, the referred-to doctor including their SLMC registration
-- number (the patient's chat shows this so they can verify who they've
-- been sent to).
create or replace function prescription_json(p "Prescription")
returns jsonb
language sql stable security definer set search_path = public as $$
    select to_jsonb(p) || jsonb_build_object(
        'status', case
            when p."expires_at" is not null and now() > p."expires_at" then 'EXPIRED'
            else p."status"::text
        end,
        'expiresAt', p."expires_at",
        'patientAge', p."patient_age",
        'patientWeightKg', p."patient_weight_kg",
        'appointmentId', p."appointment_id",
        'followupPlan', p."followup_plan"::text,
        'referredDoctor', case when p."referred_doctor_id" is null then null else (
            select jsonb_build_object(
                'id', u."id", 'firstName', u."firstName", 'lastName', u."lastName",
                'specialty', dp."specialty", 'slmcRegNo', dp."slmc_id", 'rating', dp."rating"
            )
            from "User" u
            left join "DoctorProfile" dp on dp."user_id" = u."id"
            where u."id" = p."referred_doctor_id"
        ) end,
        'items', coalesce((
            select jsonb_agg(
                to_jsonb(i) || jsonb_build_object(
                    'dispensedBy',
                    case when i."dispensedById" is null then null else (
                        select jsonb_build_object(
                            'id', u."id",
                            'firstName', u."firstName",
                            'lastName', u."lastName",
                            'pharmacyProfile', (
                                select jsonb_build_object(
                                    'pharmacyName', pp."pharmacyName",
                                    'licenseNumber', pp."licenseNumber"
                                )
                                from "PharmacyProfile" pp
                                where pp."userId" = u."id"
                            )
                        )
                        from "User" u where u."id" = i."dispensedById"
                    ) end
                )
                order by i."id"
            )
            from "PrescriptionItem" i
            where i."prescriptionId" = p."id"
        ), '[]'::jsonb),
        'patient', (
            select jsonb_build_object(
                'id', u."id", 'firstName', u."firstName", 'lastName', u."lastName",
                'nicNumber', u."nicNumber", 'medicalId', u."medicalId"
            )
            from "User" u where u."id" = p."patientId"
        ),
        'doctor', (
            select jsonb_build_object(
                'id', u."id", 'firstName', u."firstName", 'lastName', u."lastName",
                'doctorProfile', (
                    select jsonb_build_object(
                        'specialization', dp."specialty",
                        'slmcRegNo', dp."slmc_id",
                        'rating', dp."rating"
                    )
                    from "DoctorProfile" dp where dp."user_id" = u."id"
                )
            )
            from "User" u where u."id" = p."doctorId"
        )
    )
$$;

-- Re-published with appointment/follow-up columns. Dropped first
-- rather than CREATE OR REPLACE'd: adding defaulted parameters would
-- leave the old signature in place as a separate overload, making
-- existing 7-argument calls ambiguous.
drop function if exists create_prescription_with_items(uuid, uuid, text, jsonb, int, int, numeric);

create function create_prescription_with_items(
    p_patient_id     uuid,
    p_doctor_id      uuid,
    p_diagnosis      text,
    p_items          jsonb,
    p_expiry_days    int default 30,
    p_patient_age    int default null,
    p_patient_weight numeric default null,
    p_appointment_id uuid default null,
    p_followup_plan  text default 'NONE',
    p_referred_doctor_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_id uuid;
    item jsonb;
begin
    insert into "Prescription" (
        "patientId", "doctorId", "diagnosis", "expires_at", "patient_age", "patient_weight_kg",
        "appointment_id", "followup_plan", "referred_doctor_id"
    )
    values (
        p_patient_id, p_doctor_id, p_diagnosis,
        case when p_expiry_days is null then null else now() + (p_expiry_days || ' days')::interval end,
        p_patient_age, p_patient_weight,
        p_appointment_id,
        coalesce(nullif(trim(p_followup_plan), ''), 'NONE')::"PrescriptionFollowupPlan",
        p_referred_doctor_id
    )
    returning "id" into v_id;

    for item in select * from jsonb_array_elements(p_items) loop
        insert into "PrescriptionItem" (
            "prescriptionId", "drugName", "dosage", "frequency", "duration", "route", "instructions"
        )
        values (
            v_id,
            item->>'drugName',
            item->>'dosage',
            item->>'frequency',
            item->>'duration',
            coalesce(nullif(trim(item->>'route'), ''), 'Oral'),
            coalesce(item->>'instructions', '')
        );
    end loop;

    return v_id;
end $$;

-- Shared validation for the follow-up plan, used by both create and
-- update. Raises on anything inconsistent.
create or replace function validate_followup_plan(
    p_doctor_id uuid,
    p_followup_plan text,
    p_referred_doctor_id uuid
) returns void
language plpgsql stable security definer set search_path = public as $$
begin
    if coalesce(p_followup_plan, 'NONE') not in ('NONE', 'MEET_SAME_DOCTOR', 'REFER_DOCTOR') then
        raise exception 'Invalid follow-up plan';
    end if;

    if coalesce(p_followup_plan, 'NONE') = 'REFER_DOCTOR' then
        if p_referred_doctor_id is null then
            raise exception 'Please choose the doctor you are referring the patient to';
        end if;
        if p_referred_doctor_id = p_doctor_id then
            raise exception 'Choose "meet the same doctor" instead of referring to yourself';
        end if;
        if not exists (
            select 1 from "User"
            where "id" = p_referred_doctor_id and "role" = 'DOCTOR' and "verified"
        ) then
            raise exception 'Referred doctor not found';
        end if;
    elsif p_referred_doctor_id is not null then
        raise exception 'A referred doctor only applies when the plan is to refer';
    end if;
end $$;

-- ==============================================
-- App functions
-- ==============================================

drop function if exists app_create_prescription(uuid, text, jsonb, int, int, numeric);

-- Issue a prescription (verified doctors only).
--
-- p_appointment_id ties this prescription to the visit it was issued
-- at; when given it must be the caller-doctor's own appointment with
-- this patient. That link is what marks the corresponding Treatment
-- PRESCRIBED and is what the patient's AI chat follows to report the
-- prescription. Omitted (walk-in prescribing with no booked
-- appointment), the old "most recent unconfirmed treatment seen by
-- me" heuristic still applies so nothing regresses.
create function app_create_prescription(
    p_patient_id     uuid,
    p_diagnosis      text,
    p_items          jsonb,
    p_expiry_days    int default 30,
    p_patient_age    int default null,
    p_patient_weight numeric default null,
    p_appointment_id uuid default null,
    p_followup_plan  text default 'NONE',
    p_referred_doctor_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    item jsonb;
    v_id uuid;
    v_treatment_id uuid;
    p "Prescription";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors can issue prescriptions';
    end if;

    if coalesce(trim(p_diagnosis), '') = '' or length(p_diagnosis) > 500 then
        raise exception 'Please enter a diagnosis (max 500 characters)';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
        raise exception 'A prescription needs between 1 and 50 medication items';
    end if;
    for item in select * from jsonb_array_elements(p_items) loop
        if coalesce(trim(item->>'drugName'), '') = ''
           or coalesce(trim(item->>'dosage'), '') = ''
           or coalesce(trim(item->>'frequency'), '') = ''
           or coalesce(trim(item->>'duration'), '') = '' then
            raise exception 'Each medication needs a drug name, dosage, frequency, and duration';
        end if;
    end loop;
    if p_expiry_days is not null and p_expiry_days < 1 then
        raise exception 'Expiry must be at least 1 day, or left as Never';
    end if;
    if p_patient_age is not null and (p_patient_age < 0 or p_patient_age > 150) then
        raise exception 'Age must be between 0 and 150';
    end if;
    if p_patient_weight is not null and (p_patient_weight <= 0 or p_patient_weight > 500) then
        raise exception 'Weight must be between 0 and 500 kg';
    end if;

    if not exists (select 1 from "User" where "id" = p_patient_id and "role" = 'PATIENT') then
        raise exception 'Patient not found';
    end if;

    perform validate_followup_plan(me."id", p_followup_plan, p_referred_doctor_id);

    if p_appointment_id is not null and not exists (
        select 1 from "Appointment"
        where "id" = p_appointment_id
          and "doctor_id" = me."id"
          and "patient_id" = p_patient_id
    ) then
        raise exception 'That appointment is not yours for this patient';
    end if;

    v_id := create_prescription_with_items(
        p_patient_id, me."id", trim(p_diagnosis), p_items, p_expiry_days,
        p_patient_age, p_patient_weight,
        p_appointment_id, p_followup_plan, p_referred_doctor_id
    );

    -- Prefer the explicit appointment link; fall back to the legacy
    -- "most recent unconfirmed treatment I saw this patient for".
    if p_appointment_id is not null then
        select t."id" into v_treatment_id
        from "Treatment" t
        where t."appointment_id" = p_appointment_id and t."patient_id" = p_patient_id
        order by t."created_at" desc
        limit 1;
    else
        select t."id" into v_treatment_id
        from "Treatment" t
        join "Appointment" a on a."id" = t."appointment_id"
        where t."patient_id" = p_patient_id
          and a."doctor_id" = me."id"
          and t."confirmed_diagnosis" is null
        order by t."created_at" desc
        limit 1;
    end if;

    if v_treatment_id is not null then
        update "Treatment" set
            "confirmed_diagnosis"        = trim(p_diagnosis),
            "confirming_prescription_id" = v_id,
            -- Never walk a finished diagnosis backwards.
            "status" = case when "status" = 'COMPLETED' then "status" else 'PRESCRIBED' end
        where "id" = v_treatment_id;
    end if;

    select * into p from "Prescription" where "id" = v_id;
    return prescription_json(p);
end $$;

drop function if exists app_update_prescription(uuid, text, jsonb, int, int, numeric);

-- Re-published with the follow-up plan editable alongside the rest,
-- since the doctor app uses one screen for both issuing and editing.
create function app_update_prescription(
    p_prescription_id uuid,
    p_diagnosis       text,
    p_items           jsonb,
    p_expiry_days     int default 30,
    p_patient_age     int default null,
    p_patient_weight  numeric default null,
    p_followup_plan   text default 'NONE',
    p_referred_doctor_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    presc "Prescription";
    item jsonb;
    p "Prescription";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors can edit prescriptions';
    end if;

    select * into presc from "Prescription" where "id" = p_prescription_id for update;
    if presc is null then
        raise exception 'Prescription not found';
    end if;
    if presc."doctorId" <> me."id" then
        raise exception 'You can only edit prescriptions you issued';
    end if;
    if now() - presc."dateIssued" > interval '1 day' then
        raise exception 'Prescriptions can only be edited within 1 day of issuing';
    end if;
    if presc."expires_at" is not null and now() > presc."expires_at" then
        raise exception 'This prescription has expired and can no longer be edited';
    end if;
    if presc."status" in ('PARTIALLY_DISPENSED', 'FULLY_DISPENSED') or exists (
        select 1 from "PrescriptionItem" where "prescriptionId" = p_prescription_id and "dispensed"
    ) then
        raise exception 'Cannot edit — some medications on this prescription have already been dispensed';
    end if;

    if coalesce(trim(p_diagnosis), '') = '' or length(p_diagnosis) > 500 then
        raise exception 'Please enter a diagnosis (max 500 characters)';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
        raise exception 'A prescription needs between 1 and 50 medication items';
    end if;
    for item in select * from jsonb_array_elements(p_items) loop
        if coalesce(trim(item->>'drugName'), '') = ''
           or coalesce(trim(item->>'dosage'), '') = ''
           or coalesce(trim(item->>'frequency'), '') = ''
           or coalesce(trim(item->>'duration'), '') = '' then
            raise exception 'Each medication needs a drug name, dosage, frequency, and duration';
        end if;
    end loop;
    if p_expiry_days is not null and p_expiry_days < 1 then
        raise exception 'Expiry must be at least 1 day, or left as Never';
    end if;
    if p_patient_age is not null and (p_patient_age < 0 or p_patient_age > 150) then
        raise exception 'Age must be between 0 and 150';
    end if;
    if p_patient_weight is not null and (p_patient_weight <= 0 or p_patient_weight > 500) then
        raise exception 'Weight must be between 0 and 500 kg';
    end if;

    perform validate_followup_plan(me."id", p_followup_plan, p_referred_doctor_id);

    delete from "PrescriptionItem" where "prescriptionId" = p_prescription_id;
    for item in select * from jsonb_array_elements(p_items) loop
        insert into "PrescriptionItem" (
            "prescriptionId", "drugName", "dosage", "frequency", "duration", "route", "instructions"
        )
        values (
            p_prescription_id,
            item->>'drugName', item->>'dosage', item->>'frequency', item->>'duration',
            coalesce(nullif(trim(item->>'route'), ''), 'Oral'),
            coalesce(item->>'instructions', '')
        );
    end loop;

    update "Prescription" set
        "diagnosis"          = trim(p_diagnosis),
        "status"             = 'NOT_DISPENSED',
        "expires_at"         = case when p_expiry_days is null then null
                                    else presc."dateIssued" + (p_expiry_days || ' days')::interval end,
        "patient_age"        = p_patient_age,
        "patient_weight_kg"  = p_patient_weight,
        "followup_plan"      = coalesce(nullif(trim(p_followup_plan), ''), 'NONE')::"PrescriptionFollowupPlan",
        "referred_doctor_id" = p_referred_doctor_id
    where "id" = p_prescription_id;

    update "Treatment" set "confirmed_diagnosis" = trim(p_diagnosis)
    where "confirming_prescription_id" = p_prescription_id;

    select * into p from "Prescription" where "id" = p_prescription_id;
    return prescription_json(p);
end $$;

-- The caller-doctor's own still-active (BOOKED) appointments with one
-- patient, soonest first. Scanning a patient's QR uses this so the
-- doctor only ever sees the appointments they are actually seeing that
-- patient for — not the patient's whole appointment history with
-- every other doctor. Includes any linked Treatment so the doctor app
-- can show what the AI chat already suspected.
create or replace function app_doctor_appointments_for_patient(p_patient_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    result jsonb;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors can look up their appointments';
    end if;

    select coalesce(jsonb_agg(row_json order by appointment_date, start_time), '[]'::jsonb)
    into result
    from (
        select
            a."appointment_date" as appointment_date,
            a."start_time" as start_time,
            jsonb_build_object(
                'id', a."id",
                'orderNumber', a."order_number",
                'status', a."status",
                'appointmentDate', a."appointment_date",
                'startTime', a."start_time",
                'endTime', a."end_time",
                'reason', a."reason",
                'channelingCenter', (
                    select jsonb_build_object('id', cc."id", 'name', cc."name", 'city', cc."city")
                    from "ChannelingCenter" cc where cc."id" = a."channeling_center_id"
                ),
                'treatment', (
                    select jsonb_build_object(
                        'id', t."id",
                        'diseaseName', coalesce(t."confirmed_diagnosis", t."disease_name"),
                        'specialty', t."specialty",
                        'status', t."status"
                    )
                    from "Treatment" t
                    where t."appointment_id" = a."id"
                    order by t."created_at" desc
                    limit 1
                ),
                'prescriptionId', (
                    select pr."id" from "Prescription" pr
                    where pr."appointment_id" = a."id"
                    order by pr."dateIssued" desc
                    limit 1
                )
            ) as row_json
        from "Appointment" a
        where a."doctor_id" = me."id"
          and a."patient_id" = p_patient_id
          and a."status" = 'BOOKED'
    ) s;

    return result;
end $$;

-- Verified doctors the caller can refer a patient on to, with their
-- SLMC registration number. Excludes the caller themselves.
create or replace function app_search_referral_doctors(
    p_query     text default null,
    p_specialty text default null,
    p_limit     int default 25
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    result jsonb;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors can search for a referral';
    end if;

    select coalesce(jsonb_agg(row_json order by last_name, first_name), '[]'::jsonb)
    into result
    from (
        select
            u."lastName" as last_name, u."firstName" as first_name,
            jsonb_build_object(
                'id', u."id",
                'firstName', u."firstName",
                'lastName', u."lastName",
                'specialty', dp."specialty",
                'slmcRegNo', dp."slmc_id",
                'rating', dp."rating"
            ) as row_json
        from "User" u
        join "DoctorProfile" dp on dp."user_id" = u."id"
        where u."role" = 'DOCTOR'
          and u."verified"
          and u."id" <> me."id"
          and (
              p_query is null or trim(p_query) = ''
              or (u."firstName" || ' ' || u."lastName") ilike '%' || trim(p_query) || '%'
              or dp."slmc_id" ilike '%' || trim(p_query) || '%'
          )
          and (p_specialty is null or trim(p_specialty) = '' or dp."specialty" ilike '%' || trim(p_specialty) || '%')
        limit greatest(p_limit, 1)
    ) s;

    return result;
end $$;

-- Marks one of the caller-patient's own diagnoses finished. Replaces
-- the removed derived-COMPLETED behaviour in treatment_json(): a
-- diagnosis now only completes when the patient explicitly says the
-- issue is resolved (the AI chat's end-of-course check-in calls this).
create or replace function app_complete_treatment(p_treatment_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    t "Treatment";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;

    select * into t from "Treatment"
    where "id" = p_treatment_id and "patient_id" = me."id" for update;
    if t is null then
        raise exception 'Diagnosis not found';
    end if;

    update "Treatment" set "status" = 'COMPLETED' where "id" = p_treatment_id
    returning * into t;

    return treatment_json(t);
end $$;

-- ----- Function grants -----
-- Dropped-and-recreated functions come back with default (public)
-- grants, so every one of them has to be re-revoked here.

revoke execute on function treatment_json("Treatment") from public, anon, authenticated;
revoke execute on function prescription_json("Prescription") from public, anon, authenticated;
revoke execute on function create_prescription_with_items(uuid, uuid, text, jsonb, int, int, numeric, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function validate_followup_plan(uuid, text, uuid) from public, anon, authenticated;

revoke execute on function app_create_prescription(uuid, text, jsonb, int, int, numeric, uuid, text, uuid) from public, anon;
revoke execute on function app_update_prescription(uuid, text, jsonb, int, int, numeric, text, uuid) from public, anon;
revoke execute on function app_doctor_appointments_for_patient(uuid) from public, anon;
revoke execute on function app_search_referral_doctors(text, text, int) from public, anon;
revoke execute on function app_complete_treatment(uuid) from public, anon;
