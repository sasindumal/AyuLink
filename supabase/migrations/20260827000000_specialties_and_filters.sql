-- ==============================================
-- AyuLink - Canonical Specialties + Filter Support
--
-- Additive on top of 20260826000000_treatment_mgmt_and_order_numbers.sql.
--   * "Specialty" - canonical reference list (same 30 names
--     seeded into the Neo4j knowledge graph, for consistency
--     between AI-driven and manual doctor search).
--   * "DoctorSpecialty" - up to 5 specialties per doctor,
--     selected at registration. DoctorProfile.specialty is
--     kept as-is (first selected specialty, for backward
--     compat with anything still reading it directly) and
--     backfilled into the join table via a best-effort
--     case-insensitive name match.
--   * app_register_profile re-published: doctors now submit
--     p_profile->'specialtyIds' (1-5 Specialty uuids) instead
--     of a free-text 'specialization' string.
--   * app_search_doctors / app_search_doctor_slots re-published:
--     specialty filter now matches ANY of a doctor's
--     specialties, not just the single legacy column.
--   * app_list_specialties() / app_list_cities() - reference
--     lists for the mobile app's filter pickers.
-- ==============================================

-- ----- Schema -----

create table "Specialty" (
    "id"   uuid primary key default gen_random_uuid(),
    "name" text not null unique
);

insert into "Specialty" ("name") values
    ('Cardiology'), ('Clinical Nutrition'), ('Dermatology'), ('Endocrinology'),
    ('Gastroenterology'), ('General Medicine'), ('General Surgery'), ('Geriatric Medicine'),
    ('Hematology'), ('Immunology and Allergy'), ('Infectious Diseases'), ('Nephrology'),
    ('Neurology'), ('Neurosurgery'), ('Obstetrics and Gynaecology'), ('Oncology'),
    ('Ophthalmology'), ('Orthopaedic Surgery'), ('Otolaryngology (ENT)'), ('Paediatric Cardiology'),
    ('Paediatric Surgery'), ('Paediatrics'), ('Physical Medicine and Rehabilitation'),
    ('Plastic and Reconstructive Surgery'), ('Psychiatry'), ('Pulmonology (Respiratory Medicine)'),
    ('Rheumatology'), ('Urology'), ('Vascular Surgery'), ('Venereology (Sexual Health)')
on conflict ("name") do nothing;

create table "DoctorSpecialty" (
    "doctor_id"    uuid not null references "User" ("id") on delete cascade,
    "specialty_id" uuid not null references "Specialty" ("id"),
    primary key ("doctor_id", "specialty_id")
);

create index "DoctorSpecialty_specialty_id_idx" on "DoctorSpecialty" ("specialty_id");

-- Best-effort backfill for doctors registered before this migration —
-- their free-text DoctorProfile.specialty stays as the display value;
-- this just also links them into the canonical table where the name
-- happens to match, so they still show up under the new picker-based
-- specialty filters.
insert into "DoctorSpecialty" ("doctor_id", "specialty_id")
select dp."user_id", sp."id"
from "DoctorProfile" dp
join "Specialty" sp on lower(trim(dp."specialty")) = lower(sp."name")
on conflict do nothing;

-- ==============================================
-- Internal functions
-- ==============================================

-- Re-published in full: doctor registration now takes 1-5 specialty
-- ids (p_profile->'specialtyIds') instead of a free-text string.
-- DoctorProfile.specialty is set to the first selected specialty's
-- name (kept as the single "primary" display value everywhere that
-- already reads it), and all selected ones are linked in
-- "DoctorSpecialty".
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

-- Re-published: specialty filter now matches ANY of a doctor's
-- registered specialties via "DoctorSpecialty", not just the single
-- legacy DoctorProfile.specialty column.
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
    where (
        p_specialty is null or exists (
            select 1 from "DoctorSpecialty" dsp
            join "Specialty" sp on sp."id" = dsp."specialty_id"
            where dsp."doctor_id" = bookable."doctor_id" and sp."name" ilike '%' || p_specialty || '%'
        )
    )
      and (p_min_rating is null or dp."rating" >= p_min_rating);

    return result;
end $$;

-- Re-published: same "match ANY specialty" change as app_search_doctors.
create or replace function app_search_doctor_slots(
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
        where (
            p_specialty is null or exists (
                select 1 from "DoctorSpecialty" dsp
                join "Specialty" sp on sp."id" = dsp."specialty_id"
                where dsp."doctor_id" = ds."doctor_id" and sp."name" ilike '%' || p_specialty || '%'
            )
        )
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

-- ==============================================
-- App functions (mobile apps, anon key + Supabase Auth)
-- ==============================================

-- Canonical specialty list for filter pickers — static reference
-- data, no patient/doctor role gate needed.
create or replace function app_list_specialties()
returns jsonb
language sql stable security definer set search_path = public as $$
    select coalesce(jsonb_agg(jsonb_build_object('id', "id", 'name', "name") order by "name"), '[]'::jsonb)
    from "Specialty"
$$;

-- Distinct city values actually in use by channeling centers today —
-- for a filter picker (not a fixed canonical list, since center city
-- is still free text at registration).
create or replace function app_list_cities()
returns jsonb
language sql stable security definer set search_path = public as $$
    select coalesce(jsonb_agg(city order by city), '[]'::jsonb)
    from (select distinct "city" from "ChannelingCenter" where "city" is not null) c(city)
$$;

-- ----- Function grants -----

revoke execute on function app_search_doctors(text, text, real) from public, anon;
revoke execute on function app_search_doctor_slots(text, text, float8, float8, real, text, int) from public, anon;
grant execute on function app_list_specialties() to anon, authenticated;
grant execute on function app_list_cities() to anon, authenticated;

-- ----- Row Level Security -----

alter table "Specialty" enable row level security;
alter table "DoctorSpecialty" enable row level security;
