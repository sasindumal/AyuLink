-- ==============================================
-- Make pharmacy / channeling-center map coordinates OPTIONAL at
-- registration.
--
-- The mobile registration forms no longer ask for latitude / longitude
-- (they were a poor fit for a phone sign-up flow and blocked demo
-- onboarding). The "location" point columns on "PharmacyProfile" and
-- "ChannelingCenter" are intentionally LEFT in place and still NOT NULL
-- in the schema — nearest-first sorting and map deep links still read
-- them. When a registrant doesn't supply coordinates we store a sensible
-- default (Colombo city centre) so the column contract holds; a verified
-- center/pharmacy can have its real point set later (Supabase Table
-- Editor, or a future in-app "set location" screen).
--
-- Re-publishes app_register_profile in full (same body as
-- 20260827000000_specialties_and_filters.sql) with only the coordinate
-- NOT-NULL guards removed and the point() inserts made coalesce-safe.
-- ==============================================

-- Default location for a registrant who doesn't provide coordinates:
-- Colombo city centre, as point(longitude, latitude) to match the
-- existing point(x=lng, y=lat) convention everywhere else.
--   lng 79.8612, lat 6.9271

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
    -- Coordinates are optional now — only name + license are required.
    if v_role = 'PHARMACIST' and (
        coalesce(trim(p_profile->>'pharmacyName'), '') = ''
        or coalesce(trim(p_profile->>'pharmacyLicense'), '') = ''
    ) then
        raise exception 'Pharmacist registration requires a pharmacy name and license number';
    end if;
    -- Coordinates are optional now — name, address, city and contact are required.
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
