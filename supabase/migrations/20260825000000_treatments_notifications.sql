-- ==============================================
-- AyuLink - Treatments + Notifications Migration
--
-- Additive on top of 20260822010000_city_and_browse.sql. Adds:
--   * "Treatment" - a durable record of one AI-assisted
--     diagnosis (agents_system/doctor_channeling), so a
--     patient can see/resume it later and it tracks through
--     to a booked appointment.
--   * "Notification" - persisted in-app history of the
--     events notify_appointment_change() already pushes via
--     Expo, so the mobile Notifications tab has real history
--     even without push registered / app closed at send time.
--   * Re-publishes notify_appointment_change() to also insert
--     into "Notification" and to recognize a new 'completed'
--     event (previously only booked/rescheduled/cancelled).
--
-- Run via `supabase db push` or paste into the SQL Editor,
-- same as prior migrations.
-- ==============================================

-- ----- Enums -----

create type "TreatmentStatus" as enum ('DIAGNOSED', 'BOOKED', 'COMPLETED');
create type "NotificationType" as enum (
    'APPOINTMENT_BOOKED', 'APPOINTMENT_RESCHEDULED',
    'APPOINTMENT_CANCELLED', 'APPOINTMENT_COMPLETED'
);

-- ----- Schema -----

create table "Treatment" (
    "id"             uuid primary key default gen_random_uuid(),
    "patient_id"     uuid not null,
    -- the LangGraph checkpoint thread this diagnosis came from —
    -- lets the app resume the exact conversation later
    "thread_id"      text not null,
    "disease_name"   text not null,
    "specialty"      text,
    "description"    text,
    "status"         "TreatmentStatus" not null default 'DIAGNOSED',
    "appointment_id" uuid,
    "created_at"     timestamptz not null default now(),
    "updated_at"     timestamptz not null default now(),

    constraint "Treatment_patient_id_fkey"
        foreign key ("patient_id") references "User" ("id"),
    constraint "Treatment_appointment_id_fkey"
        foreign key ("appointment_id") references "Appointment" ("id"),
    -- A replayed graph step upserts instead of duplicating; a
    -- genuinely new diagnosis in a continued thread still gets its
    -- own row since the disease name differs.
    constraint "Treatment_unique_diagnosis"
        unique ("patient_id", "thread_id", "disease_name")
);

create index "Treatment_patient_id_idx" on "Treatment" ("patient_id");
create index "Treatment_thread_id_idx" on "Treatment" ("thread_id");

create trigger "Treatment_updated_at"
    before update on "Treatment"
    for each row execute function set_updated_at_snake();

create table "Notification" (
    "id"             uuid primary key default gen_random_uuid(),
    "user_id"        uuid not null,
    "type"           "NotificationType" not null,
    "title"          text not null,
    "body"           text not null,
    "appointment_id" uuid,
    "read"           boolean not null default false,
    "created_at"     timestamptz not null default now(),

    constraint "Notification_user_id_fkey"
        foreign key ("user_id") references "User" ("id") on delete cascade,
    constraint "Notification_appointment_id_fkey"
        foreign key ("appointment_id") references "Appointment" ("id")
);

create index "Notification_user_id_created_at_idx"
    on "Notification" ("user_id", "created_at" desc);

-- ==============================================
-- Internal functions
-- ==============================================

-- Serializes a Treatment row; 'status' is derived (not the stored
-- column) so a linked appointment reaching COMPLETED is reflected
-- immediately without a separate sync trigger.
create or replace function treatment_json(t "Treatment")
returns jsonb
language sql stable security definer set search_path = public as $$
    select to_jsonb(t) || jsonb_build_object(
        'status', case
            when exists (
                select 1 from "Appointment" a
                where a."id" = t."appointment_id" and a."status" = 'COMPLETED'
            ) then 'COMPLETED'
            else t."status"
        end,
        'appointment', (
            select jsonb_build_object(
                'id', a."id", 'orderNumber', a."order_number", 'status', a."status",
                'appointmentDate', a."appointment_date", 'startTime', a."start_time"
            ) from "Appointment" a where a."id" = t."appointment_id"
        )
    )
$$;

-- Re-published in full: extends the booked/rescheduled/cancelled
-- push notification with a 'completed' event, and now also inserts
-- a persisted "Notification" row per recipient (patient + center)
-- independent of whether they have a push token registered — the
-- in-app Notifications tab must have history even then. A
-- notification failure (push or persistence) must never block the
-- appointment write, so everything stays inside the existing
-- `exception when others` guard.
create or replace function notify_appointment_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_event text;
    v_doctor "User";
    v_center "ChannelingCenter";
    v_title text;
    v_body text;
    v_notif_type "NotificationType";
    v_tokens text[];
    v_messages jsonb;
begin
    if TG_OP = 'INSERT' then
        v_event := 'booked';
    elsif NEW."status" = 'CANCELLED' and OLD."status" <> 'CANCELLED' then
        v_event := 'cancelled';
    elsif NEW."status" = 'COMPLETED' and OLD."status" <> 'COMPLETED' then
        v_event := 'completed';
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
        when 'completed' then 'Appointment completed'
    end;
    v_body := format(
        'Dr. %s %s at %s on %s %s',
        v_doctor."firstName", v_doctor."lastName", v_center."name",
        to_char(NEW."appointment_date", 'DD Mon YYYY'), to_char(NEW."start_time", 'HH12:MI AM')
    );
    v_notif_type := (case v_event
        when 'booked' then 'APPOINTMENT_BOOKED'
        when 'rescheduled' then 'APPOINTMENT_RESCHEDULED'
        when 'cancelled' then 'APPOINTMENT_CANCELLED'
        when 'completed' then 'APPOINTMENT_COMPLETED'
    end)::"NotificationType";

    insert into "Notification" ("user_id", "type", "title", "body", "appointment_id")
    select uid, v_notif_type, v_title, v_body, NEW."id"
    from unnest(array[NEW."patient_id", v_center."user_id"]) as uid;

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

-- ==============================================
-- App functions (mobile apps, anon key + Supabase Auth)
-- ==============================================

-- Creates (or, for a replayed graph step, upserts) a Treatment row
-- for a confirmed diagnosis. Called by the agents backend
-- (explain_condition_node) right after the disease is confirmed —
-- before the patient has necessarily decided to book anything.
create or replace function app_create_treatment(
    p_thread_id    text,
    p_disease_name text,
    p_specialty    text default null,
    p_description  text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    t "Treatment";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients can have treatments';
    end if;
    if coalesce(trim(p_thread_id), '') = '' or coalesce(trim(p_disease_name), '') = '' then
        raise exception 'Missing thread or disease name';
    end if;

    insert into "Treatment" ("patient_id", "thread_id", "disease_name", "specialty", "description")
    values (me."id", trim(p_thread_id), trim(p_disease_name), nullif(trim(p_specialty), ''), nullif(trim(p_description), ''))
    on conflict ("patient_id", "thread_id", "disease_name") do update
        set "specialty" = excluded."specialty", "description" = excluded."description"
    returning * into t;

    return treatment_json(t);
end $$;

-- Links a Treatment to the appointment just booked for it (called
-- by the agents backend's booking_agent right after a successful
-- booking) and marks it BOOKED.
create or replace function app_link_treatment_appointment(
    p_treatment_id   uuid,
    p_appointment_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    t "Treatment";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;

    select * into t from "Treatment" where "id" = p_treatment_id and "patient_id" = me."id" for update;
    if t is null then
        raise exception 'Treatment not found';
    end if;
    if not exists (select 1 from "Appointment" where "id" = p_appointment_id and "patient_id" = me."id") then
        raise exception 'Appointment not found';
    end if;

    update "Treatment" set "appointment_id" = p_appointment_id, "status" = 'BOOKED'
    where "id" = p_treatment_id
    returning * into t;

    return treatment_json(t);
end $$;

-- Caller's own treatments (patients only), newest first.
create or replace function app_list_my_treatments()
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
        raise exception 'Only patients have treatments';
    end if;

    select coalesce(jsonb_agg(treatment_json(t) order by t."created_at" desc), '[]'::jsonb)
    into result from "Treatment" t where t."patient_id" = me."id";
    return result;
end $$;

-- Caller's own notification history, newest first. No role
-- restriction — both patients and channeling centers receive
-- appointment notifications.
create or replace function app_list_notifications(p_limit int default 50)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    v_uid uuid := auth.uid();
    result jsonb;
begin
    if v_uid is null then
        raise exception 'Not signed in';
    end if;

    select coalesce(jsonb_agg(to_jsonb(n) order by n."created_at" desc), '[]'::jsonb)
    into result
    from (
        select * from "Notification"
        where "user_id" = v_uid
        order by "created_at" desc
        limit greatest(p_limit, 1)
    ) n;
    return result;
end $$;

create or replace function app_mark_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_uid uuid := auth.uid();
    n "Notification";
begin
    if v_uid is null then
        raise exception 'Not signed in';
    end if;

    update "Notification" set "read" = true
    where "id" = p_notification_id and "user_id" = v_uid
    returning * into n;
    if n is null then
        raise exception 'Notification not found';
    end if;
    return to_jsonb(n);
end $$;

create or replace function app_mark_all_notifications_read()
returns void
language plpgsql security definer set search_path = public as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'Not signed in';
    end if;
    update "Notification" set "read" = true where "user_id" = v_uid and "read" = false;
end $$;

create or replace function app_unread_notification_count()
returns integer
language sql stable security definer set search_path = public as $$
    select count(*)::int from "Notification" where "user_id" = auth.uid() and "read" = false;
$$;

-- ----- Function grants -----

revoke execute on function treatment_json("Treatment") from public, anon, authenticated;
revoke execute on function notify_appointment_change() from public, anon, authenticated;

revoke execute on function app_create_treatment(text, text, text, text) from public, anon;
revoke execute on function app_link_treatment_appointment(uuid, uuid) from public, anon;
revoke execute on function app_list_my_treatments() from public, anon;
revoke execute on function app_list_notifications(int) from public, anon;
revoke execute on function app_mark_notification_read(uuid) from public, anon;
revoke execute on function app_mark_all_notifications_read() from public, anon;
revoke execute on function app_unread_notification_count() from public, anon;

-- ----- Row Level Security -----

alter table "Treatment" enable row level security;
alter table "Notification" enable row level security;
