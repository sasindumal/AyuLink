-- ==============================================
-- AyuLink - Patient / doctor gender
--
-- Registration collected identity (NIC, name, DOB, phone) but never sex.
-- It matters clinically in ways the rest of the profile already assumes:
-- a pregnancy status column exists on "PatientProfile" but nothing ever
-- set it, and Ayu had no way to know whether the pregnancy question was
-- even applicable. This adds a single MALE / FEMALE flag on "User",
-- collected at sign-up for patients and doctors, and threads it into the
-- three read paths that need it.
--
-- Design notes:
--
--  * MALE / FEMALE only, matching the two states the pregnancy logic
--    branches on. Nullable, so the ~2,200 seeded accounts and any row
--    created before this migration stay valid; new patient / doctor
--    registrations require it (checked in app_register_profile).
--
--  * text + CHECK, not an enum — same reasoning as the health-profile
--    vocabularies (20260915000000): a closed two-value set today that may
--    gain a value is cheaper to widen as a CHECK than as a type a dozen
--    functions reference.
--
--  * gender is surfaced to a doctor (app_get_patient_health_profile,
--    FULL scope) but NOT to a pharmacist's dispensing view — same
--    need-to-know narrowing that view already applies.
--
-- Re-publishes app_register_profile (body from
-- 20260912000000_optional_registration_coords.sql), app_get_my_profile
-- (from 20260916000000_profile_details.sql) and health_profile_json
-- (from 20260915000000_patient_health_profile.sql), each changed only
-- where marked "-- gender:".
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

alter table "User" add column if not exists "gender" text;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'User_gender_check'
    ) then
        alter table "User" add constraint "User_gender_check"
            check ("gender" is null or "gender" in ('MALE', 'FEMALE'));
    end if;
end $$;


-- ---------------------------------------------------------------- register
create or replace function app_register_profile(p_profile jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_uid uuid := auth.uid();
    v_role "Role";
    v_nic text := trim(p_profile->>'nicNumber');
    v_specialty_ids uuid[];
    v_specialty_count int;
    v_primary_specialty text;
    v_default_location point := point(79.8612, 6.9271);  -- Colombo city centre (lng, lat)
begin
    if v_uid is null then
        raise exception 'Not signed in';
    end if;
    if exists (select 1 from "User" where "id" = v_uid) then
        raise exception 'Your account is already registered';
    end if;

    v_role := coalesce(p_profile->>'role', 'PATIENT')::"Role";

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
    -- gender: required for the two roles that have a person behind them.
    if v_role in ('PATIENT', 'DOCTOR')
       and coalesce(p_profile->>'gender', '') not in ('MALE', 'FEMALE') then
        raise exception 'Please select a gender';
    end if;

    if v_role = 'DOCTOR' then
        if coalesce(trim(p_profile->>'slmcRegNo'), '') = '' then
            raise exception 'Doctor registration requires an SLMC number';
        end if;
        select array_agg((elem)::uuid) into v_specialty_ids
        from jsonb_array_elements_text(coalesce(p_profile->'specialtyIds', '[]'::jsonb)) as elem;
        v_specialty_count := coalesce(array_length(v_specialty_ids, 1), 0);
        if v_specialty_count < 1 or v_specialty_count > 5 then
            raise exception 'Choose between 1 and 5 specialties';
        end if;
        if exists (
            select 1 from unnest(v_specialty_ids) sid
            where not exists (select 1 from "Specialty" where "id" = sid)
        ) then
            raise exception 'One or more selected specialties are invalid';
        end if;
    end if;
    if v_role = 'PHARMACIST' and (
        coalesce(trim(p_profile->>'pharmacyName'), '') = ''
        or coalesce(trim(p_profile->>'pharmacyLicense'), '') = ''
    ) then
        raise exception 'Pharmacist registration requires a pharmacy name and license number';
    end if;
    if v_role = 'CHANNELING_CENTER' and (
        coalesce(trim(p_profile->>'centerName'), '') = ''
        or coalesce(trim(p_profile->>'centerAddress'), '') = ''
        or coalesce(trim(p_profile->>'centerContactNumber'), '') = ''
        or coalesce(trim(p_profile->>'centerCity'), '') = ''
    ) then
        raise exception 'Channeling center registration requires a name, address, city, and contact number';
    end if;

    insert into "User" (
        "id", "nicNumber", "firstName", "lastName", "mobileNumber",
        "dob", "role", "verified", "medicalId", "gender"  -- gender:
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
        'AYU-' || upper(v_nic),
        nullif(p_profile->>'gender', '')  -- gender: NULL for org accounts
    );

    if v_role = 'DOCTOR' then
        select "name" into v_primary_specialty from "Specialty" where "id" = v_specialty_ids[1];

        insert into "DoctorProfile" ("user_id", "slmc_id", "specialty")
        values (v_uid, trim(p_profile->>'slmcRegNo'), v_primary_specialty);

        insert into "DoctorSpecialty" ("doctor_id", "specialty_id")
        select v_uid, sid from unnest(v_specialty_ids) sid
        on conflict do nothing;
    elsif v_role = 'PHARMACIST' then
        insert into "PharmacyProfile" ("userId", "pharmacyName", "licenseNumber", "location")
        values (
            v_uid,
            trim(p_profile->>'pharmacyName'),
            trim(p_profile->>'pharmacyLicense'),
            case
                when (p_profile->>'pharmacyLongitude') is not null
                     and (p_profile->>'pharmacyLatitude') is not null
                then point(
                    (p_profile->>'pharmacyLongitude')::float8,
                    (p_profile->>'pharmacyLatitude')::float8
                )
                else v_default_location
            end
        );
    elsif v_role = 'CHANNELING_CENTER' then
        insert into "ChannelingCenter" ("user_id", "name", "address", "contact_number", "location", "city")
        values (
            v_uid,
            trim(p_profile->>'centerName'),
            trim(p_profile->>'centerAddress'),
            trim(p_profile->>'centerContactNumber'),
            case
                when (p_profile->>'centerLongitude') is not null
                     and (p_profile->>'centerLatitude') is not null
                then point(
                    (p_profile->>'centerLongitude')::float8,
                    (p_profile->>'centerLatitude')::float8
                )
                else v_default_location
            end,
            trim(p_profile->>'centerCity')
        );
    end if;

    return app_get_my_profile();
exception
    when unique_violation then
        raise exception 'This NIC, SLMC number, or pharmacy license is already registered';
end $$;


-- ------------------------------------------------------------ my profile
create or replace function app_get_my_profile()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    extra jsonb := '{}'::jsonb;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Your profile was not found. Please register first';
    end if;

    if me."role" = 'DOCTOR' then
        extra := jsonb_build_object('doctorProfile', (
            select jsonb_build_object(
                'slmcRegNo', dp."slmc_id",
                'specialization', dp."specialty",
                'rating', dp."rating",
                'specialties', coalesce((
                    select jsonb_agg(s."name" order by s."name")
                    from "DoctorSpecialty" ds
                    join "Specialty" s on s."id" = ds."specialty_id"
                    where ds."doctor_id" = me."id"
                ), '[]'::jsonb)
            )
            from "DoctorProfile" dp where dp."user_id" = me."id"
        ));
    elsif me."role" = 'PHARMACIST' then
        extra := jsonb_build_object('pharmacyProfile', (
            select jsonb_build_object(
                'pharmacyName', pp."pharmacyName",
                'licenseNumber', pp."licenseNumber"
            )
            from "PharmacyProfile" pp where pp."userId" = me."id"
        ));
    elsif me."role" = 'CHANNELING_CENTER' then
        extra := jsonb_build_object('channelingCenter', (
            select jsonb_build_object(
                'id', cc."id",
                'name', cc."name",
                'address', cc."address",
                'city', cc."city",
                'contactNumber', cc."contact_number"
            )
            from "ChannelingCenter" cc where cc."user_id" = me."id"
        ));
    end if;

    return jsonb_build_object(
        'id', me."id",
        'nicNumber', me."nicNumber",
        'firstName', me."firstName",
        'lastName', me."lastName",
        'mobileNumber', me."mobileNumber",
        'dob', me."dob",
        'gender', me."gender",  -- gender:
        'role', me."role",
        'medicalId', me."medicalId",
        'verified', me."verified",
        'memberSince', me."createdAt"
    ) || extra;
end $$;


-- ------------------------------------------------------- health profile json
create or replace function health_profile_json(p_patient_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'patientId', p_patient_id,
        -- gender: from "User", so Ayu and the profile screen can decide
        -- whether the pregnancy section applies.
        'gender', (select "gender" from "User" where "id" = p_patient_id),
        'profile', coalesce(
            (select to_jsonb(pp) from "PatientProfile" pp where pp."user_id" = p_patient_id),
            '{}'::jsonb
        ),
        'allergies', coalesce((
            select jsonb_agg(to_jsonb(a) order by
                case a."severity" when 'ANAPHYLAXIS' then 0 when 'SEVERE' then 1
                                  when 'MODERATE' then 2 when 'MILD' then 3 else 4 end,
                a."allergen")
            from "PatientAllergy" a where a."patient_id" = p_patient_id
        ), '[]'::jsonb),
        'conditions', coalesce((
            select jsonb_agg(to_jsonb(c) order by
                case c."status" when 'ACTIVE' then 0 else 1 end, c."condition")
            from "PatientCondition" c where c."patient_id" = p_patient_id
        ), '[]'::jsonb),
        'medications', coalesce((
            select jsonb_agg(to_jsonb(m) order by m."ongoing" desc, m."drug_name")
            from "PatientMedication" m where m."patient_id" = p_patient_id
        ), '[]'::jsonb),
        'history', coalesce((
            select jsonb_agg(to_jsonb(h) order by h."kind", h."occurred_year" desc nulls last, h."label")
            from "PatientHistoryEvent" h where h."patient_id" = p_patient_id
        ), '[]'::jsonb)
    );
$$;

revoke execute on function app_register_profile(jsonb) from public, anon;
revoke execute on function app_get_my_profile() from public, anon;
revoke execute on function health_profile_json(uuid) from public, anon;
