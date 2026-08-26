-- ==============================================
-- AyuLink - District -> City rename + doctor/center
-- browsing RPCs
--
-- Additive on top of 20260822000000_appointments.sql.
--   * ChannelingCenter.district -> ChannelingCenter.city
--     (and every function referencing it)
--   * New browsing RPCs alongside the existing quick
--     "soonest slot" search (app_search_doctor_slots,
--     unchanged in behavior other than the city rename):
--       - app_search_doctors: list bookable doctors by
--         specialty/city/rating
--       - app_get_doctor_availability: every upcoming
--         slot for one doctor over the next N days,
--         across all their centers
--       - app_get_center_availability: every upcoming
--         slot at one center over the next N days,
--         across all doctors there
-- ==============================================

alter table "ChannelingCenter" rename column "district" to "city";

-- ----- Re-published functions (district -> city) -----

-- Re-published in full to extend CHANNELING_CENTER
-- registration with "centerCity" instead of "centerDistrict".
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
    ) then
        raise exception 'Doctor registration requires SLMC number and specialization';
    end if;
    if v_role = 'PHARMACIST' and (
        coalesce(trim(p_profile->>'pharmacyName'), '') = ''
        or coalesce(trim(p_profile->>'pharmacyLicense'), '') = ''
        or (p_profile->>'pharmacyLatitude') is null
        or (p_profile->>'pharmacyLongitude') is null
    ) then
        raise exception 'Pharmacist registration requires pharmacy name, license number, and location';
    end if;
    if v_role = 'CHANNELING_CENTER' and (
        coalesce(trim(p_profile->>'centerName'), '') = ''
        or coalesce(trim(p_profile->>'centerAddress'), '') = ''
        or coalesce(trim(p_profile->>'centerContactNumber'), '') = ''
        or coalesce(trim(p_profile->>'centerCity'), '') = ''
        or (p_profile->>'centerLatitude') is null
        or (p_profile->>'centerLongitude') is null
    ) then
        raise exception 'Channeling center registration requires a name, address, city, contact number, and location';
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
        insert into "DoctorProfile" ("user_id", "slmc_id", "specialty")
        values (v_uid, trim(p_profile->>'slmcRegNo'), trim(p_profile->>'specialization'));
    elsif v_role = 'PHARMACIST' then
        insert into "PharmacyProfile" ("userId", "pharmacyName", "licenseNumber", "location")
        values (
            v_uid,
            trim(p_profile->>'pharmacyName'),
            trim(p_profile->>'pharmacyLicense'),
            point(
                (p_profile->>'pharmacyLongitude')::float8,
                (p_profile->>'pharmacyLatitude')::float8
            )
        );
    elsif v_role = 'CHANNELING_CENTER' then
        insert into "ChannelingCenter" ("user_id", "name", "address", "contact_number", "location", "city")
        values (
            v_uid,
            trim(p_profile->>'centerName'),
            trim(p_profile->>'centerAddress'),
            trim(p_profile->>'centerContactNumber'),
            point(
                (p_profile->>'centerLongitude')::float8,
                (p_profile->>'centerLatitude')::float8
            ),
            trim(p_profile->>'centerCity')
        );
    end if;

    return app_get_my_profile();
exception
    when unique_violation then
        raise exception 'This NIC, SLMC number, or pharmacy license is already registered';
end $$;

-- Re-published: 'district' -> 'city' in the serialized shape.
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
                'city', cc."city", 'contactNumber', cc."contact_number"
            ) from "ChannelingCenter" cc where cc."id" = a."channeling_center_id"
        )
    )
$$;

-- Re-published: p_district -> p_city. CREATE OR REPLACE cannot
-- rename an existing parameter, so the old signature is dropped
-- first; its revoke is re-stated below since a fresh function
-- object starts with default (public-visible) grants again.
drop function if exists app_search_doctor_slots(text, text, float8, float8, real, text, int);

create function app_search_doctor_slots(
    p_specialty      text default null,
    p_city           text default null,
    p_near_lat       float8 default null,
    p_near_lng       float8 default null,
    p_min_rating     real default null,
    p_sort           text default 'soonest',
    p_lookahead_days int default 21
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
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients can search for appointments';
    end if;
    if p_sort not in ('soonest', 'nearest', 'rating') then
        raise exception 'Invalid sort option';
    end if;
    if p_sort = 'nearest' and (p_near_lat is null or p_near_lng is null) then
        raise exception 'Location is required to sort by nearest';
    end if;

    with candidates as (
        select
            ds."id" as schedule_id, ds."doctor_id", ds."channeling_center_id",
            ds."start_time", ds."end_time", d.day::date as slot_date
        from "DoctorSchedule" ds
        join "User" du on du."id" = ds."doctor_id" and du."verified" = true
        join "DoctorProfile" dp on dp."user_id" = ds."doctor_id"
        join "ChannelingCenter" cc on cc."id" = ds."channeling_center_id"
        cross join generate_series(
            current_date, current_date + (p_lookahead_days || ' days')::interval, interval '1 day'
        ) as d(day)
        where (p_specialty is null or dp."specialty" ilike '%' || p_specialty || '%')
          and (p_city is null or cc."city" ilike '%' || p_city || '%')
          and (p_min_rating is null or dp."rating" >= p_min_rating)
          and (
              case ds."day_of_week"
                  when 'MONDAY' then 1 when 'TUESDAY' then 2 when 'WEDNESDAY' then 3
                  when 'THURSDAY' then 4 when 'FRIDAY' then 5 when 'SATURDAY' then 6
                  when 'SUNDAY' then 7
              end = extract(isodow from d.day)::int
          )
          and (d.day::date > current_date or ds."start_time" > current_time)
          and not exists (
              select 1 from "Appointment" a
              where a."doctor_id" = ds."doctor_id"
                and a."channeling_center_id" = ds."channeling_center_id"
                and a."appointment_date" = d.day::date
                and a."start_time" = ds."start_time"
                and a."status" <> 'CANCELLED'
          )
    ),
    next_per_slot as (
        select distinct on (schedule_id)
            schedule_id, doctor_id, channeling_center_id, start_time, end_time, slot_date
        from candidates
        order by schedule_id, slot_date asc
    )
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'doctorScheduleId', n.schedule_id,
            'doctorId', du."id", 'doctorFirstName', du."firstName", 'doctorLastName', du."lastName",
            'specialty', dp."specialty", 'rating', dp."rating",
            'channelingCenterId', cc."id", 'channelingCenterName', cc."name",
            'address', cc."address", 'city', cc."city", 'contactNumber', cc."contact_number",
            'nextAvailableDate', n.slot_date, 'startTime', n.start_time, 'endTime', n.end_time,
            'distanceKm', case when p_near_lat is null or p_near_lng is null then null
                else (cc."location" <-> point(p_near_lng, p_near_lat)) * 111.32 end
        )
        order by
            case when p_sort = 'soonest' then n.slot_date end asc,
            case when p_sort = 'soonest' then n.start_time end asc,
            case when p_sort = 'rating' then dp."rating" end desc nulls last,
            case when p_sort = 'nearest' and p_near_lat is not null
                 then (cc."location" <-> point(p_near_lng, p_near_lat)) end asc
    ), '[]'::jsonb)
    into result
    from next_per_slot n
    join "User" du on du."id" = n.doctor_id
    join "DoctorProfile" dp on dp."user_id" = n.doctor_id
    join "ChannelingCenter" cc on cc."id" = n.channeling_center_id;

    return result;
end $$;

-- ----- New browsing RPCs -----

-- List bookable doctors (i.e. holding at least one DoctorSchedule
-- slot) matching specialty/city/rating. Feeds the "browse by
-- doctor" flow: pick a doctor here, then call
-- app_get_doctor_availability for their upcoming slots.
create or replace function app_search_doctors(
    p_specialty  text default null,
    p_city       text default null,
    p_min_rating real default null
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
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients can search for doctors';
    end if;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'doctorId', du."id",
            'doctorFirstName', du."firstName",
            'doctorLastName', du."lastName",
            'specialty', dp."specialty",
            'rating', dp."rating"
        )
        order by du."firstName", du."lastName"
    ), '[]'::jsonb)
    into result
    from (
        select distinct ds."doctor_id"
        from "DoctorSchedule" ds
        join "ChannelingCenter" cc on cc."id" = ds."channeling_center_id"
        where (p_city is null or cc."city" ilike '%' || p_city || '%')
    ) bookable
    join "User" du on du."id" = bookable."doctor_id" and du."verified" = true
    join "DoctorProfile" dp on dp."user_id" = bookable."doctor_id"
    where (p_specialty is null or dp."specialty" ilike '%' || p_specialty || '%')
      and (p_min_rating is null or dp."rating" >= p_min_rating);

    return result;
end $$;

-- Every upcoming slot for one doctor, across all their centers,
-- over the next p_lookahead_days (default 14) — not collapsed to
-- "soonest per schedule" like app_search_doctor_slots, so the
-- patient can pick any upcoming date/time, not just the nearest.
create or replace function app_get_doctor_availability(
    p_doctor_id      uuid,
    p_lookahead_days int default 14
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
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients can view doctor availability';
    end if;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'doctorScheduleId', ds."id",
            'channelingCenterId', cc."id",
            'channelingCenterName', cc."name",
            'address', cc."address",
            'city', cc."city",
            'contactNumber', cc."contact_number",
            'date', c.slot_date,
            'startTime', ds."start_time",
            'endTime', ds."end_time"
        )
        order by c.slot_date, ds."start_time"
    ), '[]'::jsonb)
    into result
    from "DoctorSchedule" ds
    join "ChannelingCenter" cc on cc."id" = ds."channeling_center_id"
    cross join lateral (
        select d.day::date as slot_date
        from generate_series(
            current_date, current_date + (p_lookahead_days || ' days')::interval, interval '1 day'
        ) as d(day)
        where (
            case ds."day_of_week"
                when 'MONDAY' then 1 when 'TUESDAY' then 2 when 'WEDNESDAY' then 3
                when 'THURSDAY' then 4 when 'FRIDAY' then 5 when 'SATURDAY' then 6
                when 'SUNDAY' then 7
            end = extract(isodow from d.day)::int
        )
        and (d.day::date > current_date or ds."start_time" > current_time)
    ) as c
    where ds."doctor_id" = p_doctor_id
      and not exists (
          select 1 from "Appointment" a
          where a."doctor_id" = ds."doctor_id"
            and a."channeling_center_id" = ds."channeling_center_id"
            and a."appointment_date" = c.slot_date
            and a."start_time" = ds."start_time"
            and a."status" <> 'CANCELLED'
      );

    return result;
end $$;

-- Every upcoming slot at one center, across all doctors there, over
-- the next p_lookahead_days (default 14).
create or replace function app_get_center_availability(
    p_channeling_center_id uuid,
    p_lookahead_days       int default 14
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
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients can view center availability';
    end if;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'doctorScheduleId', ds."id",
            'doctorId', du."id",
            'doctorFirstName', du."firstName",
            'doctorLastName', du."lastName",
            'specialty', dp."specialty",
            'rating', dp."rating",
            'date', c.slot_date,
            'startTime', ds."start_time",
            'endTime', ds."end_time"
        )
        order by c.slot_date, ds."start_time"
    ), '[]'::jsonb)
    into result
    from "DoctorSchedule" ds
    join "User" du on du."id" = ds."doctor_id" and du."verified" = true
    join "DoctorProfile" dp on dp."user_id" = ds."doctor_id"
    cross join lateral (
        select d.day::date as slot_date
        from generate_series(
            current_date, current_date + (p_lookahead_days || ' days')::interval, interval '1 day'
        ) as d(day)
        where (
            case ds."day_of_week"
                when 'MONDAY' then 1 when 'TUESDAY' then 2 when 'WEDNESDAY' then 3
                when 'THURSDAY' then 4 when 'FRIDAY' then 5 when 'SATURDAY' then 6
                when 'SUNDAY' then 7
            end = extract(isodow from d.day)::int
        )
        and (d.day::date > current_date or ds."start_time" > current_time)
    ) as c
    where ds."channeling_center_id" = p_channeling_center_id
      and not exists (
          select 1 from "Appointment" a
          where a."doctor_id" = ds."doctor_id"
            and a."channeling_center_id" = ds."channeling_center_id"
            and a."appointment_date" = c.slot_date
            and a."start_time" = ds."start_time"
            and a."status" <> 'CANCELLED'
      );

    return result;
end $$;

-- ----- Function grants -----

revoke execute on function app_search_doctor_slots(text, text, float8, float8, real, text, int) from public, anon;
revoke execute on function app_search_doctors(text, text, real) from public, anon;
revoke execute on function app_get_doctor_availability(uuid, int) from public, anon;
revoke execute on function app_get_center_availability(uuid, int) from public, anon;
