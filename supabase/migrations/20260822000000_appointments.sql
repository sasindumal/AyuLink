-- ==============================================
-- AyuLink - Appointment Booking Migration
--
-- Additive on top of 20260719000000_init.sql. Adds:
--   * "district" on ChannelingCenter (clean text filter)
--   * "Appointment" (a dated booking against a doctor's
--     recurring DoctorSchedule slot) + "DeviceToken"
--     (Expo push tokens)
--   * app_* RPCs for searching/booking/managing appointments
--   * a pg_net-backed trigger that pushes an Expo notification
--     to the patient and channeling center on booking/
--     reschedule/cancel
--
-- Run via `supabase db push` or paste into the SQL Editor,
-- same as the init migration.
-- ==============================================

create extension if not exists pg_net;

-- ----- Enum -----

create type "AppointmentStatus" as enum ('BOOKED', 'COMPLETED', 'CANCELLED');

-- ----- Schema changes -----

alter table "ChannelingCenter" add column "district" text;

create sequence "Appointment_order_seq";

create table "Appointment" (
    "id"                   uuid primary key default gen_random_uuid(),
    -- e.g. APT-000123
    "order_number"         text not null unique
        default ('APT-' || lpad(nextval('"Appointment_order_seq"')::text, 6, '0')),
    "patient_id"           uuid not null,
    "doctor_id"            uuid not null,
    "channeling_center_id" uuid not null,
    -- the recurring template slot this was booked from
    "doctor_schedule_id"   uuid not null,
    "appointment_date"     date not null,
    -- snapshotted from DoctorSchedule at booking time so a later
    -- change to the doctor's recurring template never retroactively
    -- changes an already-booked appointment
    "start_time"           time not null,
    "end_time"             time not null,
    "status"               "AppointmentStatus" not null default 'BOOKED',
    "reason"               text,
    "cancelled_by"         uuid,
    "cancelled_reason"     text,
    "cancelled_at"         timestamptz,
    "created_at"           timestamptz not null default now(),
    "updated_at"           timestamptz not null default now(),

    constraint "Appointment_patient_id_fkey"
        foreign key ("patient_id") references "User" ("id"),
    constraint "Appointment_doctor_id_fkey"
        foreign key ("doctor_id") references "User" ("id"),
    constraint "Appointment_channeling_center_id_fkey"
        foreign key ("channeling_center_id") references "ChannelingCenter" ("id"),
    constraint "Appointment_doctor_schedule_id_fkey"
        foreign key ("doctor_schedule_id") references "DoctorSchedule" ("id"),
    constraint "Appointment_cancelled_by_fkey"
        foreign key ("cancelled_by") references "User" ("id"),
    constraint "Appointment_time_check"
        check ("end_time" > "start_time")
);

-- Double-booking guard: a doctor cannot hold two non-cancelled
-- appointments at the same center/date/start time. A partial
-- (not plain) unique index so cancelling an appointment frees the
-- slot back up for rebooking.
create unique index "Appointment_slot_unique"
    on "Appointment" ("doctor_id", "channeling_center_id", "appointment_date", "start_time")
    where "status" <> 'CANCELLED';

create index "Appointment_patient_id_idx" on "Appointment" ("patient_id");
create index "Appointment_doctor_id_idx" on "Appointment" ("doctor_id");
create index "Appointment_channeling_center_id_idx" on "Appointment" ("channeling_center_id");
create index "Appointment_appointment_date_idx" on "Appointment" ("appointment_date");

create trigger "Appointment_updated_at"
    before update on "Appointment"
    for each row execute function set_updated_at_snake();

-- Multiple rows per user (multi-device); re-registering the same
-- token is idempotent via the unique constraint + upsert in
-- app_register_push_token.
create table "DeviceToken" (
    "id"         uuid primary key default gen_random_uuid(),
    "user_id"    uuid not null,
    "token"      text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),

    constraint "DeviceToken_user_id_fkey"
        foreign key ("user_id") references "User" ("id") on delete cascade,
    constraint "DeviceToken_token_unique" unique ("token")
);

create index "DeviceToken_user_id_idx" on "DeviceToken" ("user_id");

create trigger "DeviceToken_updated_at"
    before update on "DeviceToken"
    for each row execute function set_updated_at_snake();

-- ==============================================
-- Internal functions
-- ==============================================

-- Serializes an Appointment row with nested patient/doctor/center,
-- matching the shape mobile apps consume. Mirrors prescription_json.
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
                'district', cc."district", 'contactNumber', cc."contact_number"
            ) from "ChannelingCenter" cc where cc."id" = a."channeling_center_id"
        )
    )
$$;

-- Fire-and-forget push notification on booking/reschedule/cancel,
-- via pg_net calling Expo's push API directly. A notification
-- failure must never block the appointment write.
create or replace function notify_appointment_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_event text;
    v_doctor "User";
    v_center "ChannelingCenter";
    v_title text;
    v_body text;
    v_tokens text[];
    v_messages jsonb;
begin
    if TG_OP = 'INSERT' then
        v_event := 'booked';
    elsif NEW."status" = 'CANCELLED' and OLD."status" <> 'CANCELLED' then
        v_event := 'cancelled';
    elsif NEW."status" = 'BOOKED' and (
        NEW."appointment_date" <> OLD."appointment_date"
        or NEW."start_time" <> OLD."start_time"
        or NEW."channeling_center_id" <> OLD."channeling_center_id"
        or NEW."doctor_id" <> OLD."doctor_id"
    ) then
        v_event := 'rescheduled';
    else
        return NEW;
    end if;

    select * into v_doctor from "User" where "id" = NEW."doctor_id";
    select * into v_center from "ChannelingCenter" where "id" = NEW."channeling_center_id";

    v_title := case v_event
        when 'booked' then 'Appointment booked'
        when 'rescheduled' then 'Appointment rescheduled'
        when 'cancelled' then 'Appointment cancelled'
    end;
    v_body := format(
        'Dr. %s %s at %s on %s %s',
        v_doctor."firstName", v_doctor."lastName", v_center."name",
        to_char(NEW."appointment_date", 'DD Mon YYYY'), to_char(NEW."start_time", 'HH12:MI AM')
    );

    select array_agg(distinct dt."token") into v_tokens
    from "DeviceToken" dt
    where dt."user_id" in (NEW."patient_id", v_center."user_id");

    if v_tokens is null or array_length(v_tokens, 1) = 0 then
        return NEW;
    end if;

    select jsonb_agg(jsonb_build_object(
        'to', t, 'title', v_title, 'body', v_body, 'sound', 'default',
        'data', jsonb_build_object('appointmentId', NEW."id", 'type', v_event)
    )) into v_messages
    from unnest(v_tokens) as t;

    perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
        body := v_messages
    );

    return NEW;
exception
    when others then
        return NEW;
end $$;

create trigger "Appointment_notify"
    after insert or update on "Appointment"
    for each row execute function notify_appointment_change();

-- Re-published in full (see 20260719000000_init.sql for the prior
-- version) to extend CHANNELING_CENTER registration with a required
-- "centerDistrict" field, stored on ChannelingCenter.district.
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
        or coalesce(trim(p_profile->>'centerDistrict'), '') = ''
        or (p_profile->>'centerLatitude') is null
        or (p_profile->>'centerLongitude') is null
    ) then
        raise exception 'Channeling center registration requires a name, address, district, contact number, and location';
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
        insert into "ChannelingCenter" ("user_id", "name", "address", "contact_number", "location", "district")
        values (
            v_uid,
            trim(p_profile->>'centerName'),
            trim(p_profile->>'centerAddress'),
            trim(p_profile->>'centerContactNumber'),
            point(
                (p_profile->>'centerLongitude')::float8,
                (p_profile->>'centerLatitude')::float8
            ),
            trim(p_profile->>'centerDistrict')
        );
    end if;

    return app_get_my_profile();
exception
    when unique_violation then
        raise exception 'This NIC, SLMC number, or pharmacy license is already registered';
end $$;

-- ==============================================
-- App functions (mobile apps, anon key + Supabase Auth)
-- ==============================================

-- Search upcoming doctor availability by specialty / district /
-- nearest / rating, returning the soonest upcoming date+time per
-- recurring DoctorSchedule slot within a lookahead window.
create or replace function app_search_doctor_slots(
    p_specialty      text default null,
    p_district       text default null,
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
          and (p_district is null or cc."district" ilike '%' || p_district || '%')
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
            'address', cc."address", 'district', cc."district", 'contactNumber', cc."contact_number",
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

-- Book an appointment against a doctor's recurring schedule slot on
-- a specific upcoming date. Returns the booked appointment,
-- including its order number.
create or replace function app_book_appointment(
    p_doctor_schedule_id uuid,
    p_appointment_date   date,
    p_reason             text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    sched "DoctorSchedule";
    v_dow int;
    v_id uuid;
    a "Appointment";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients can book appointments';
    end if;

    select * into sched from "DoctorSchedule" where "id" = p_doctor_schedule_id;
    if sched is null then
        raise exception 'Schedule slot not found';
    end if;
    if p_appointment_date < current_date then
        raise exception 'Cannot book an appointment in the past';
    end if;

    v_dow := case sched."day_of_week"
        when 'MONDAY' then 1 when 'TUESDAY' then 2 when 'WEDNESDAY' then 3
        when 'THURSDAY' then 4 when 'FRIDAY' then 5 when 'SATURDAY' then 6 when 'SUNDAY' then 7
    end;
    if v_dow <> extract(isodow from p_appointment_date)::int then
        raise exception 'The selected date does not match this schedule''s day of week';
    end if;
    if p_appointment_date = current_date and sched."start_time" <= current_time then
        raise exception 'This time slot has already passed today';
    end if;

    insert into "Appointment" (
        "patient_id", "doctor_id", "channeling_center_id", "doctor_schedule_id",
        "appointment_date", "start_time", "end_time", "reason"
    ) values (
        me."id", sched."doctor_id", sched."channeling_center_id", sched."id",
        p_appointment_date, sched."start_time", sched."end_time", nullif(trim(p_reason), '')
    )
    returning "id" into v_id;

    select * into a from "Appointment" where "id" = v_id;
    return appointment_json(a);
exception
    when unique_violation then
        raise exception 'This slot was just booked by someone else. Please choose another time.';
end $$;

-- Caller's own appointments (patients only), newest first.
create or replace function app_list_my_appointments()
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
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients have appointments here';
    end if;

    select coalesce(jsonb_agg(appointment_json(a) order by a."appointment_date" desc, a."start_time" desc), '[]'::jsonb)
    into result from "Appointment" a where a."patient_id" = me."id";
    return result;
end $$;

-- Appointments booked at the caller's own channeling center
-- (channeling centers only), with optional status/date filters.
create or replace function app_list_center_appointments(
    p_status "AppointmentStatus" default null,
    p_date   date default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    v_center_id uuid;
    result jsonb;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'CHANNELING_CENTER' then
        raise exception 'Only channeling centers can view center appointments';
    end if;

    select "id" into v_center_id from "ChannelingCenter" where "user_id" = me."id";
    if v_center_id is null then
        raise exception 'Channeling center profile not found';
    end if;

    select coalesce(jsonb_agg(appointment_json(a) order by a."appointment_date", a."start_time"), '[]'::jsonb)
    into result
    from "Appointment" a
    where a."channeling_center_id" = v_center_id
      and (p_status is null or a."status" = p_status)
      and (p_date is null or a."appointment_date" = p_date);
    return result;
end $$;

-- Reschedule a BOOKED appointment to a different date/schedule slot.
-- Callable by the owning patient, or by the owning channeling center.
create or replace function app_reschedule_appointment(
    p_appointment_id uuid,
    p_new_doctor_schedule_id uuid,
    p_new_date date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    appt "Appointment";
    sched "DoctorSchedule";
    v_dow int;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;

    select * into appt from "Appointment" where "id" = p_appointment_id for update;
    if appt is null then
        raise exception 'Appointment not found';
    end if;

    if me."role" = 'PATIENT' then
        if appt."patient_id" <> me."id" then
            raise exception 'Appointment not found';
        end if;
    elsif me."role" = 'CHANNELING_CENTER' then
        if not exists (
            select 1 from "ChannelingCenter" where "id" = appt."channeling_center_id" and "user_id" = me."id"
        ) then
            raise exception 'Appointment not found';
        end if;
    else
        raise exception 'You cannot reschedule appointments';
    end if;

    if appt."status" <> 'BOOKED' then
        raise exception 'Only booked appointments can be rescheduled';
    end if;

    select * into sched from "DoctorSchedule" where "id" = p_new_doctor_schedule_id;
    if sched is null then
        raise exception 'Schedule slot not found';
    end if;
    if p_new_date < current_date then
        raise exception 'Cannot reschedule to a past date';
    end if;

    v_dow := case sched."day_of_week"
        when 'MONDAY' then 1 when 'TUESDAY' then 2 when 'WEDNESDAY' then 3
        when 'THURSDAY' then 4 when 'FRIDAY' then 5 when 'SATURDAY' then 6 when 'SUNDAY' then 7
    end;
    if v_dow <> extract(isodow from p_new_date)::int then
        raise exception 'The selected date does not match this schedule''s day of week';
    end if;
    if p_new_date = current_date and sched."start_time" <= current_time then
        raise exception 'This time slot has already passed today';
    end if;

    update "Appointment" set
        "doctor_id" = sched."doctor_id",
        "channeling_center_id" = sched."channeling_center_id",
        "doctor_schedule_id" = sched."id",
        "appointment_date" = p_new_date,
        "start_time" = sched."start_time",
        "end_time" = sched."end_time"
    where "id" = p_appointment_id
    returning * into appt;

    return appointment_json(appt);
exception
    when unique_violation then
        raise exception 'This slot was just booked by someone else. Please choose another time.';
end $$;

-- Cancel a BOOKED appointment (soft delete — preserves the order
-- number / history). Callable by the owning patient, or by the
-- owning channeling center.
create or replace function app_cancel_appointment(
    p_appointment_id uuid,
    p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    appt "Appointment";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;

    select * into appt from "Appointment" where "id" = p_appointment_id for update;
    if appt is null then
        raise exception 'Appointment not found';
    end if;

    if me."role" = 'PATIENT' then
        if appt."patient_id" <> me."id" then
            raise exception 'Appointment not found';
        end if;
    elsif me."role" = 'CHANNELING_CENTER' then
        if not exists (
            select 1 from "ChannelingCenter" where "id" = appt."channeling_center_id" and "user_id" = me."id"
        ) then
            raise exception 'Appointment not found';
        end if;
    else
        raise exception 'You cannot cancel appointments';
    end if;

    if appt."status" <> 'BOOKED' then
        raise exception 'Only booked appointments can be cancelled';
    end if;

    update "Appointment" set
        "status" = 'CANCELLED',
        "cancelled_by" = me."id",
        "cancelled_reason" = nullif(trim(p_reason), ''),
        "cancelled_at" = now()
    where "id" = p_appointment_id
    returning * into appt;

    return appointment_json(appt);
end $$;

-- Mark a BOOKED appointment COMPLETED (channeling centers only, for
-- their own center's appointments).
create or replace function app_complete_appointment(p_appointment_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    appt "Appointment";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'CHANNELING_CENTER' then
        raise exception 'Only channeling centers can mark appointments complete';
    end if;

    select a.* into appt
    from "Appointment" a
    join "ChannelingCenter" cc on cc."id" = a."channeling_center_id"
    where a."id" = p_appointment_id and cc."user_id" = me."id"
    for update;
    if appt is null then
        raise exception 'Appointment not found';
    end if;
    if appt."status" <> 'BOOKED' then
        raise exception 'Only booked appointments can be marked complete';
    end if;

    update "Appointment" set "status" = 'COMPLETED' where "id" = p_appointment_id
    returning * into appt;
    return appointment_json(appt);
end $$;

-- Register (or re-register) this device's Expo push token for the
-- signed-in user. Idempotent — re-registering the same token just
-- updates ownership/timestamp.
create or replace function app_register_push_token(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'Not signed in';
    end if;
    if coalesce(trim(p_token), '') = '' then
        raise exception 'Missing push token';
    end if;

    insert into "DeviceToken" ("user_id", "token")
    values (v_uid, trim(p_token))
    on conflict ("token") do update set "user_id" = excluded."user_id", "updated_at" = now();
end $$;

-- ----- Function grants -----

revoke execute on function appointment_json("Appointment") from public, anon, authenticated;
revoke execute on function notify_appointment_change() from public, anon, authenticated;

revoke execute on function app_search_doctor_slots(text, text, float8, float8, real, text, int) from public, anon;
revoke execute on function app_book_appointment(uuid, date, text) from public, anon;
revoke execute on function app_list_my_appointments() from public, anon;
revoke execute on function app_list_center_appointments("AppointmentStatus", date) from public, anon;
revoke execute on function app_reschedule_appointment(uuid, uuid, date) from public, anon;
revoke execute on function app_cancel_appointment(uuid, text) from public, anon;
revoke execute on function app_complete_appointment(uuid) from public, anon;
revoke execute on function app_register_push_token(text) from public, anon;

-- ----- Row Level Security -----

alter table "Appointment" enable row level security;
alter table "DeviceToken" enable row level security;
