-- ==============================================
-- AyuLink - Supabase Schema (standalone-ready)
--
-- Auth: Supabase Auth (GoTrue). Users sign in with a
-- synthetic email derived from their NIC:
--   <nic-lowercase>@nic.ayulink.app
-- "User".id references auth.users(id).
--
-- Access model:
--  * Tables have RLS enabled with NO policies (deny-all).
--  * The web server uses the service role key (bypasses RLS).
--  * Mobile apps use the anon key and call the app_* functions
--    below (SECURITY DEFINER, role-checked via auth.uid()).
--
-- Requires: Supabase Dashboard -> Authentication -> Sign In /
-- Up -> Email: DISABLE "Confirm email" (the synthetic
-- addresses cannot receive mail).
--
-- Run via `supabase db push` or paste into the SQL Editor.
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
    "id"           uuid primary key references auth.users ("id") on delete cascade,
    "nicNumber"    text not null unique,
    "firstName"    text not null,
    "lastName"     text not null,
    "mobileNumber" text not null,
    "dob"          timestamptz not null,
    "role"         "Role" not null default 'PATIENT',
    -- Patients are auto-verified; doctors and pharmacists must be
    -- verified manually (set to true in the Supabase dashboard)
    -- before they can issue or dispense prescriptions.
    "verified"     boolean not null default false,
    -- Derived from the NIC: AYU-<NIC>
    "medicalId"    text not null unique,
    "createdAt"    timestamptz not null default now(),
    "updatedAt"    timestamptz not null default now()
);

create table "DoctorProfile" (
    "id"             uuid primary key default gen_random_uuid(),
    "userId"         uuid not null unique,
    "slmcRegNo"      text not null unique,
    "specialization" text not null,
    "hospitalName"   text not null,

    constraint "DoctorProfile_userId_fkey"
        foreign key ("userId") references "User" ("id") on delete cascade
);

create table "PharmacyProfile" (
    "id"              uuid primary key default gen_random_uuid(),
    "userId"          uuid not null unique,
    "pharmacyName"    text not null,
    "licenseNumber"   text not null unique,
    "pharmacyAddress" text not null,

    constraint "PharmacyProfile_userId_fkey"
        foreign key ("userId") references "User" ("id") on delete cascade
);

create table "Prescription" (
    "id"         uuid primary key default gen_random_uuid(),
    "patientId"  uuid not null,
    "doctorId"   uuid not null,
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
    "id"             uuid primary key default gen_random_uuid(),
    "prescriptionId" uuid not null,
    "drugName"       text not null,
    "dosage"         text not null,
    "frequency"      text not null,
    "duration"       text not null,
    "instructions"   text not null default '',
    "dispensed"      boolean not null default false,
    "dispensedAt"    timestamptz,
    "dispensedById"  uuid,

    constraint "PrescriptionItem_prescriptionId_fkey"
        foreign key ("prescriptionId") references "Prescription" ("id") on delete cascade,
    constraint "PrescriptionItem_dispensedById_fkey"
        foreign key ("dispensedById") references "User" ("id")
);

-- One-time codes for verifying mobile numbers (optional OTP flow)
create table "MobileOtp" (
    "id"           uuid primary key default gen_random_uuid(),
    "mobileNumber" text not null,
    "codeHash"     text not null,
    "createdAt"    timestamptz not null default now(),
    "expiresAt"    timestamptz not null,
    "verifiedAt"   timestamptz
);

-- ----- Indexes -----

create index "Prescription_patientId_idx" on "Prescription" ("patientId");
create index "Prescription_doctorId_idx" on "Prescription" ("doctorId");
create index "PrescriptionItem_prescriptionId_idx" on "PrescriptionItem" ("prescriptionId");
create index "PrescriptionItem_dispensedById_idx" on "PrescriptionItem" ("dispensedById");
create index "MobileOtp_mobileNumber_idx" on "MobileOtp" ("mobileNumber");

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

-- ==============================================
-- Internal functions (service role / web server)
-- ==============================================

-- Create a profile row (and doctor/pharmacy profile) for an
-- existing auth user. Called by the web server after
-- auth.admin.createUser.
create or replace function create_user_with_profile(
    p_user_id uuid,
    p_user jsonb,
    p_doctor jsonb default null,
    p_pharmacy jsonb default null
) returns "User"
language plpgsql security definer set search_path = public as $$
declare
    v_user "User";
begin
    insert into "User" (
        "id", "nicNumber", "firstName", "lastName", "mobileNumber",
        "dob", "role", "verified", "medicalId"
    )
    values (
        p_user_id,
        p_user->>'nicNumber',
        p_user->>'firstName',
        p_user->>'lastName',
        p_user->>'mobileNumber',
        (p_user->>'dob')::timestamptz,
        (p_user->>'role')::"Role",
        (p_user->>'role')::"Role" = 'PATIENT',
        'AYU-' || upper(p_user->>'nicNumber')
    )
    returning * into v_user;

    if p_doctor is not null then
        insert into "DoctorProfile" ("userId", "slmcRegNo", "specialization", "hospitalName")
        values (p_user_id, p_doctor->>'slmcRegNo', p_doctor->>'specialization', p_doctor->>'hospitalName');
    end if;

    if p_pharmacy is not null then
        insert into "PharmacyProfile" ("userId", "pharmacyName", "licenseNumber", "pharmacyAddress")
        values (p_user_id, p_pharmacy->>'pharmacyName', p_pharmacy->>'licenseNumber', p_pharmacy->>'pharmacyAddress');
    end if;

    return v_user;
end $$;

-- Create a prescription with its items in one transaction.
create or replace function create_prescription_with_items(
    p_patient_id uuid,
    p_doctor_id uuid,
    p_diagnosis text,
    p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_id uuid;
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
end $$;

-- Dispense or revert one item and recompute the prescription status
-- atomically. Locks the prescription row.
create or replace function dispense_prescription_item(
    p_prescription_id uuid,
    p_item_id uuid,
    p_dispensed boolean,
    p_pharmacist_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
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
end $$;

-- Serialize a prescription with nested items / patient / doctor,
-- matching the shape the web API and mobile apps expect.
create or replace function prescription_json(p "Prescription")
returns jsonb
language sql stable security definer set search_path = public as $$
    select to_jsonb(p) || jsonb_build_object(
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
                        'specialization', dp."specialization",
                        'hospitalName', dp."hospitalName",
                        'slmcRegNo', dp."slmcRegNo"
                    )
                    from "DoctorProfile" dp where dp."userId" = u."id"
                )
            )
            from "User" u where u."id" = p."doctorId"
        )
    )
$$;

-- ==============================================
-- App functions (mobile apps, anon key + Supabase Auth)
-- All check the caller via auth.uid(); raised messages are
-- shown to the user as-is.
-- ==============================================

-- Caller's own profile
create or replace function app_get_my_profile()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Your profile was not found. Please register first';
    end if;
    return jsonb_build_object(
        'id', me."id",
        'nicNumber', me."nicNumber",
        'firstName', me."firstName",
        'lastName', me."lastName",
        'role', me."role",
        'medicalId', me."medicalId",
        'verified', me."verified"
    );
end $$;

-- Complete registration after auth.signUp: create the profile
-- row (and doctor/pharmacy profile) for the caller.
create or replace function app_register_profile(p_profile jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_uid uuid := auth.uid();
    v_role "Role";
    v_nic text := trim(p_profile->>'nicNumber');
begin
    if v_uid is null then
        raise exception 'Not signed in';
    end if;
    if exists (select 1 from "User" where "id" = v_uid) then
        raise exception 'Your account is already registered';
    end if;

    v_role := coalesce(p_profile->>'role', 'PATIENT')::"Role";

    -- Basic validation (mirrors the web zod schema)
    if v_nic !~ '^([0-9]{9}[vVxX]|[0-9]{12})$' then
        raise exception 'Invalid NIC number format';
    end if;
    if coalesce(trim(p_profile->>'firstName'), '') = ''
       or coalesce(trim(p_profile->>'lastName'), '') = '' then
        raise exception 'First and last name are required';
    end if;
    if trim(p_profile->>'mobileNumber') !~ '^\+?[0-9]{9,15}$' then
        raise exception 'Invalid mobile number';
    end if;
    if (p_profile->>'dob') is null
       or (p_profile->>'dob')::timestamptz >= now() then
        raise exception 'Date of birth must be a valid date in the past';
    end if;

    if v_role = 'DOCTOR' and (
        coalesce(trim(p_profile->>'slmcRegNo'), '') = ''
        or coalesce(trim(p_profile->>'specialization'), '') = ''
        or coalesce(trim(p_profile->>'hospitalName'), '') = ''
    ) then
        raise exception 'Doctor registration requires SLMC number, specialization, and hospital name';
    end if;
    if v_role = 'PHARMACIST' and (
        coalesce(trim(p_profile->>'pharmacyName'), '') = ''
        or coalesce(trim(p_profile->>'pharmacyLicense'), '') = ''
        or coalesce(trim(p_profile->>'pharmacyAddress'), '') = ''
    ) then
        raise exception 'Pharmacist registration requires pharmacy name, license number, and address';
    end if;

    insert into "User" (
        "id", "nicNumber", "firstName", "lastName", "mobileNumber",
        "dob", "role", "verified", "medicalId"
    )
    values (
        v_uid,
        v_nic,
        trim(p_profile->>'firstName'),
        trim(p_profile->>'lastName'),
        trim(p_profile->>'mobileNumber'),
        (p_profile->>'dob')::timestamptz,
        v_role,
        v_role = 'PATIENT',
        'AYU-' || upper(v_nic)
    );

    if v_role = 'DOCTOR' then
        insert into "DoctorProfile" ("userId", "slmcRegNo", "specialization", "hospitalName")
        values (v_uid, trim(p_profile->>'slmcRegNo'), trim(p_profile->>'specialization'), trim(p_profile->>'hospitalName'));
    elsif v_role = 'PHARMACIST' then
        insert into "PharmacyProfile" ("userId", "pharmacyName", "licenseNumber", "pharmacyAddress")
        values (v_uid, trim(p_profile->>'pharmacyName'), trim(p_profile->>'pharmacyLicense'), trim(p_profile->>'pharmacyAddress'));
    end if;

    return app_get_my_profile();
exception
    when unique_violation then
        raise exception 'This NIC, SLMC number, or pharmacy license is already registered';
end $$;

-- Role-filtered prescription list (same rules as the web API)
create or replace function app_list_prescriptions()
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

    if me."role" = 'PATIENT' then
        select coalesce(jsonb_agg(prescription_json(p) order by p."dateIssued" desc), '[]'::jsonb)
        into result
        from "Prescription" p
        where p."patientId" = me."id";
    elsif me."role" = 'DOCTOR' then
        select coalesce(jsonb_agg(prescription_json(p) order by p."dateIssued" desc), '[]'::jsonb)
        into result
        from "Prescription" p
        where p."doctorId" = me."id";
    else
        select coalesce(jsonb_agg(prescription_json(p) order by p."dateIssued" desc), '[]'::jsonb)
        into result
        from "Prescription" p
        where exists (
            select 1 from "PrescriptionItem" i
            where i."prescriptionId" = p."id" and i."dispensedById" = me."id"
        );
    end if;

    return result;
end $$;

-- Patient lookup by Medical ID (doctors and pharmacists only)
create or replace function app_lookup_patient(p_medical_id text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    pat "User";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" = 'PATIENT' then
        raise exception 'Patients cannot look up other patients';
    end if;

    select * into pat from "User"
    where "medicalId" = trim(p_medical_id) and "role" = 'PATIENT';
    if pat is null then
        raise exception 'Patient not found';
    end if;

    return jsonb_build_object(
        'id', pat."id",
        'firstName', pat."firstName",
        'lastName', pat."lastName",
        'nicNumber', pat."nicNumber",
        'medicalId', pat."medicalId",
        'dob', pat."dob",
        'mobileNumber', pat."mobileNumber",
        'prescriptionsAsPatient', coalesce((
            select jsonb_agg(prescription_json(p) order by p."dateIssued" desc)
            from "Prescription" p where p."patientId" = pat."id"
        ), '[]'::jsonb)
    );
end $$;

-- Issue a prescription (verified doctors only)
create or replace function app_create_prescription(
    p_patient_id uuid,
    p_diagnosis text,
    p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    item jsonb;
    v_id uuid;
    p "Prescription";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors can issue prescriptions';
    end if;
    if not me."verified" then
        raise exception 'Your account is pending verification. You cannot issue prescriptions yet';
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

    if not exists (select 1 from "User" where "id" = p_patient_id and "role" = 'PATIENT') then
        raise exception 'Patient not found';
    end if;

    v_id := create_prescription_with_items(p_patient_id, me."id", trim(p_diagnosis), p_items);

    select * into p from "Prescription" where "id" = v_id;
    return prescription_json(p);
end $$;

-- Dispense or revert one item (verified pharmacists only)
create or replace function app_dispense_item(
    p_prescription_id uuid,
    p_item_id uuid,
    p_dispensed boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    result jsonb;
    p "Prescription";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PHARMACIST' then
        raise exception 'Only pharmacists can dispense medications';
    end if;
    if not me."verified" then
        raise exception 'Your account is pending verification. You cannot dispense medications yet';
    end if;

    begin
        result := dispense_prescription_item(p_prescription_id, p_item_id, p_dispensed, me."id");
    exception
        when others then
            case SQLERRM
                when 'PRESCRIPTION_NOT_FOUND' then raise exception 'Prescription not found';
                when 'ITEM_NOT_FOUND' then raise exception 'Item not found in this prescription';
                when 'NOT_DISPENSED' then raise exception 'This item has not been dispensed yet';
                when 'REVERT_WINDOW_EXPIRED' then raise exception 'Cannot revert — the 15-minute window has expired';
                else raise;
            end case;
    end;

    select * into p from "Prescription" where "id" = p_prescription_id;
    return jsonb_build_object(
        'prescription', prescription_json(p),
        'drugName', result->>'drugName',
        'allDispensed', (result->>'allDispensed')::boolean
    );
end $$;

-- Caller's pharmacy profile (null when none on file)
create or replace function app_get_pharmacy_profile()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PHARMACIST' then
        raise exception 'Only pharmacists have a pharmacy profile';
    end if;
    return (
        select to_jsonb(pp) from "PharmacyProfile" pp where pp."userId" = me."id"
    );
end $$;

-- Resolve a pharmacy license number to the login email
-- (used by the pharmacy app's license login tab; callable pre-auth)
create or replace function app_login_email_for_license(p_license text)
returns text
language sql stable security definer set search_path = public as $$
    select lower(u."nicNumber") || '@nic.ayulink.app'
    from "PharmacyProfile" pp
    join "User" u on u."id" = pp."userId"
    where pp."licenseNumber" = trim(p_license)
$$;

-- ----- Function grants -----
-- Internal functions must not be callable with the anon or
-- user JWTs; app_* functions are for authenticated users
-- (the license->email resolver also works pre-auth).

revoke execute on function create_user_with_profile(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function create_prescription_with_items(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function dispense_prescription_item(uuid, uuid, boolean, uuid) from public, anon, authenticated;
revoke execute on function prescription_json("Prescription") from public, anon, authenticated;
revoke execute on function set_updated_at() from public, anon, authenticated;

revoke execute on function app_get_my_profile() from public, anon;
revoke execute on function app_register_profile(jsonb) from public, anon;
revoke execute on function app_list_prescriptions() from public, anon;
revoke execute on function app_lookup_patient(text) from public, anon;
revoke execute on function app_create_prescription(uuid, text, jsonb) from public, anon;
revoke execute on function app_dispense_item(uuid, uuid, boolean) from public, anon;
revoke execute on function app_get_pharmacy_profile() from public, anon;

grant execute on function app_login_email_for_license(text) to anon, authenticated;

-- ----- Row Level Security -----
-- No table policies: direct table access with the anon key is
-- fully blocked. The service role (web server) bypasses RLS;
-- mobile apps go through the SECURITY DEFINER app_* functions.

alter table "User" enable row level security;
alter table "DoctorProfile" enable row level security;
alter table "PharmacyProfile" enable row level security;
alter table "Prescription" enable row level security;
alter table "PrescriptionItem" enable row level security;
alter table "MobileOtp" enable row level security;
