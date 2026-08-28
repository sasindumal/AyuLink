-- ==============================================
-- AyuLink - Care-journey events (visit -> prescription -> dispensing)
--
-- Requires 20260908000000_care_event_notification_types.sql first.
--
-- Everything that happens to a patient AFTER the AI chat books them
-- now becomes a first-class, notifiable event:
--   * the doctor starts the visit  (app_doctor_start_appointment)
--   * the doctor issues a prescription        (trigger on Prescription)
--   * a pharmacy dispenses one drug   (trigger on PrescriptionItem)
--
-- Each inserts a "Notification" row AND fires an Expo push, reusing the
-- exact pattern notify_appointment_change() already uses. A failure to
-- notify must never roll back the clinical write, so every notify path
-- is wrapped in its own exception guard.
--
-- app_treatment_timeline() then replays those same events as an ordered,
-- stably-keyed list. The agent backend reads it to append them into the
-- patient's AI chat (see /chat/sync) — the keys are what make that sync
-- idempotent, so re-syncing never double-posts a message.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

alter table "Appointment" add column if not exists "doctor_started_at" timestamptz null;

-- ==============================================
-- Internal helpers
-- ==============================================

-- Best-effort fan-out: persist a Notification per recipient, then push
-- to whatever device tokens they have. Never raises.
create or replace function notify_users(
    p_user_ids uuid[],
    p_type "NotificationType",
    p_title text,
    p_body text,
    p_appointment_id uuid default null,
    p_data jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
    v_tokens text[];
    v_messages jsonb;
begin
    insert into "Notification" ("user_id", "type", "title", "body", "appointment_id")
    select uid, p_type, p_title, p_body, p_appointment_id
    from unnest(p_user_ids) as uid
    where uid is not null;

    select array_agg(distinct dt."token") into v_tokens
    from "DeviceToken" dt
    where dt."user_id" = any(p_user_ids);

    if v_tokens is null or array_length(v_tokens, 1) = 0 then
        return;
    end if;

    select jsonb_agg(jsonb_build_object(
        'to', t, 'title', p_title, 'body', p_body, 'sound', 'default',
        'data', p_data || jsonb_build_object('type', p_type::text)
    )) into v_messages
    from unnest(v_tokens) as t;

    perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
        body := v_messages
    );
exception
    when others then
        return;
end $$;

-- Free-text medication duration -> whole days, for working out when a
-- course finishes. Understands the doctor app's own DURATION_PRESETS
-- ("3 days", "14 days", "1 month", "Ongoing") plus loose variants.
-- Returns null when open-ended ("Ongoing") or unparseable — callers
-- treat null as "no course end we can schedule against".
create or replace function parse_duration_days(p_duration text)
returns int
language plpgsql immutable set search_path = public as $$
declare
    v text := lower(coalesce(trim(p_duration), ''));
    v_num int;
begin
    if v = '' or v like '%ongoing%' or v like '%continuous%' or v like '%as needed%' then
        return null;
    end if;

    v_num := nullif(substring(v from '(\d+)'), '')::int;
    if v_num is null then
        return null;
    end if;

    if v like '%month%' then
        return v_num * 30;
    elsif v like '%week%' then
        return v_num * 7;
    elsif v like '%day%' then
        return v_num;
    end if;

    -- A bare number with no unit is conventionally days in this app.
    return v_num;
end $$;

-- ==============================================
-- Event triggers
-- ==============================================

-- A doctor issued a prescription -> tell the patient, with enough in
-- the body to be useful straight from the lock screen.
create or replace function notify_prescription_issued()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_doctor "User";
    v_count int;
begin
    select * into v_doctor from "User" where "id" = NEW."doctorId";
    select count(*) into v_count from "PrescriptionItem" where "prescriptionId" = NEW."id";

    perform notify_users(
        array[NEW."patientId"],
        'PRESCRIPTION_ISSUED',
        'Prescription issued',
        format('Dr. %s %s issued a prescription%s',
               v_doctor."firstName", v_doctor."lastName",
               case when v_count > 0
                    then format(' with %s medication%s', v_count, case when v_count = 1 then '' else 's' end)
                    else '' end),
        NEW."appointment_id",
        jsonb_build_object('prescriptionId', NEW."id")
    );
    return NEW;
exception
    when others then
        return NEW;
end $$;

drop trigger if exists "Prescription_notify_issued" on "Prescription";
create trigger "Prescription_notify_issued"
    after insert on "Prescription"
    for each row execute function notify_prescription_issued();

-- A pharmacy dispensed one drug -> tell the patient which drug, from
-- whom. Fires only on the false -> true transition, so the 15-minute
-- revert-and-redispense path doesn't spam them.
create or replace function notify_item_dispensed()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_presc "Prescription";
    v_pharmacy text;
begin
    if NEW."dispensed" is not true or OLD."dispensed" is true then
        return NEW;
    end if;

    select * into v_presc from "Prescription" where "id" = NEW."prescriptionId";
    if v_presc is null then
        return NEW;
    end if;

    select coalesce(pp."pharmacyName", u."firstName" || ' ' || u."lastName")
    into v_pharmacy
    from "User" u
    left join "PharmacyProfile" pp on pp."userId" = u."id"
    where u."id" = NEW."dispensedById";

    perform notify_users(
        array[v_presc."patientId"],
        'PRESCRIPTION_DISPENSED',
        'Medication dispensed',
        format('%s was dispensed%s', NEW."drugName",
               case when v_pharmacy is null then '' else ' by ' || v_pharmacy end),
        v_presc."appointment_id",
        jsonb_build_object('prescriptionId', v_presc."id", 'itemId', NEW."id")
    );
    return NEW;
exception
    when others then
        return NEW;
end $$;

drop trigger if exists "PrescriptionItem_notify_dispensed" on "PrescriptionItem";
create trigger "PrescriptionItem_notify_dispensed"
    after update on "PrescriptionItem"
    for each row execute function notify_item_dispensed();

-- ==============================================
-- App functions
-- ==============================================

-- The doctor marks the visit as started (called when they open the
-- appointment after scanning the patient's QR). Idempotent: starting
-- an already-started visit is a no-op rather than a second notification.
create or replace function app_doctor_start_appointment(p_appointment_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    a "Appointment";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors can start a visit';
    end if;

    select * into a from "Appointment"
    where "id" = p_appointment_id and "doctor_id" = me."id" for update;
    if a is null then
        raise exception 'That appointment is not yours';
    end if;
    if a."status" <> 'BOOKED' then
        raise exception 'This appointment is no longer active';
    end if;

    if a."doctor_started_at" is not null then
        return appointment_json(a);
    end if;

    update "Appointment" set "doctor_started_at" = now()
    where "id" = p_appointment_id
    returning * into a;

    perform notify_users(
        array[a."patient_id"],
        'APPOINTMENT_STARTED',
        'Your doctor is ready',
        format('Dr. %s %s has started your appointment', me."firstName", me."lastName"),
        a."id",
        jsonb_build_object('appointmentId', a."id")
    );

    return appointment_json(a);
end $$;

-- Everything that has happened on one diagnosis, oldest first, as
-- stably-keyed events. The agent backend replays these into the
-- patient's AI chat; `key` is what keeps that sync idempotent.
--
-- Also reports courseEndsAt: the latest (dispensed_at + duration) across
-- all dispensed medications, i.e. when the patient finishes everything.
-- Null while nothing is dispensed yet, or when any drug is open-ended.
create or replace function app_treatment_timeline(p_treatment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    t "Treatment";
    v_events jsonb := '[]'::jsonb;
    v_presc "Prescription";
    v_course_end timestamptz;
    v_any_open_ended boolean := false;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;

    select * into t from "Treatment"
    where "id" = p_treatment_id and "patient_id" = me."id";
    if t is null then
        raise exception 'Diagnosis not found';
    end if;

    -- 1. The visit itself
    select jsonb_agg(e order by at) into v_events
    from (
        select
            'appt_started:' || a."id" as key,
            'APPOINTMENT_STARTED' as type,
            a."doctor_started_at" as at,
            jsonb_build_object(
                'doctorName', 'Dr. ' || du."firstName" || ' ' || du."lastName",
                'specialty', ddp."specialty",
                'centerName', cc."name",
                'orderNumber', a."order_number"
            ) as payload
        from "Appointment" a
        join "User" du on du."id" = a."doctor_id"
        left join "DoctorProfile" ddp on ddp."user_id" = a."doctor_id"
        left join "ChannelingCenter" cc on cc."id" = a."channeling_center_id"
        where a."id" = t."appointment_id" and a."doctor_started_at" is not null
    ) x(key, type, at, payload)
    cross join lateral (select jsonb_build_object('key', key, 'type', type, 'at', at, 'payload', payload)) y(e);

    v_events := coalesce(v_events, '[]'::jsonb);

    -- 2. The prescription issued at that visit (if any)
    select * into v_presc from "Prescription"
    where "appointment_id" = t."appointment_id" and "patientId" = t."patient_id"
    order by "dateIssued" desc
    limit 1;

    if v_presc is null and t."confirming_prescription_id" is not null then
        select * into v_presc from "Prescription" where "id" = t."confirming_prescription_id";
    end if;

    -- Tested against `v_presc."id"`, never `v_presc is not null`: for a
    -- composite, IS NOT NULL is true only when EVERY column is non-null,
    -- so a perfectly good prescription row fails it the moment any
    -- nullable column (expires_at, patient_age, referred_doctor_id, ...)
    -- is empty. (`IS NULL` is safe for the not-found case above, since a
    -- missed SELECT INTO leaves every field null — the asymmetry is the
    -- trap.)
    if v_presc."id" is not null then
        v_events := v_events || jsonb_build_array(jsonb_build_object(
            'key', 'rx_issued:' || v_presc."id",
            'type', 'PRESCRIPTION_ISSUED',
            'at', v_presc."dateIssued",
            'payload', prescription_json(v_presc)
        ));

        -- 3. Each drug as it gets dispensed
        v_events := v_events || coalesce((
            select jsonb_agg(jsonb_build_object(
                'key', 'rx_dispensed:' || i."id",
                'type', 'ITEM_DISPENSED',
                'at', i."dispensedAt",
                'payload', jsonb_build_object(
                    'drugName', i."drugName",
                    'dosage', i."dosage",
                    'frequency', i."frequency",
                    'duration', i."duration",
                    'route', i."route",
                    'instructions', i."instructions",
                    'durationDays', parse_duration_days(i."duration"),
                    'dispensedAt', i."dispensedAt",
                    'pharmacyName', (
                        select coalesce(pp."pharmacyName", u."firstName" || ' ' || u."lastName")
                        from "User" u
                        left join "PharmacyProfile" pp on pp."userId" = u."id"
                        where u."id" = i."dispensedById"
                    )
                )
            ) order by i."dispensedAt")
            from "PrescriptionItem" i
            where i."prescriptionId" = v_presc."id" and i."dispensed" and i."dispensedAt" is not null
        ), '[]'::jsonb);

        -- When does the whole course finish?
        select
            max(i."dispensedAt" + (parse_duration_days(i."duration") || ' days')::interval),
            bool_or(parse_duration_days(i."duration") is null)
        into v_course_end, v_any_open_ended
        from "PrescriptionItem" i
        where i."prescriptionId" = v_presc."id" and i."dispensed" and i."dispensedAt" is not null;
    end if;

    return jsonb_build_object(
        'treatmentId', t."id",
        'threadId', t."thread_id",
        'status', t."status",
        'diseaseName', coalesce(t."confirmed_diagnosis", t."disease_name"),
        'courseEndsAt', case when v_any_open_ended then null else v_course_end end,
        'followupPlan', coalesce(v_presc."followup_plan"::text, 'NONE'),
        'events', v_events
    );
end $$;

-- Resolve a chat thread to the caller's own diagnosis, so the agent
-- backend can go from the thread it is serving to the treatment whose
-- timeline it needs.
create or replace function app_treatment_by_thread(p_thread_id text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    t "Treatment";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;

    select * into t from "Treatment"
    where "thread_id" = p_thread_id and "patient_id" = me."id"
    order by "created_at" desc
    limit 1;

    if t is null then
        return null;
    end if;
    return treatment_json(t);
end $$;

-- ----- Function grants -----

revoke execute on function notify_users(uuid[], "NotificationType", text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function notify_prescription_issued() from public, anon, authenticated;
revoke execute on function notify_item_dispensed() from public, anon, authenticated;

revoke execute on function app_doctor_start_appointment(uuid) from public, anon;
revoke execute on function app_treatment_timeline(uuid) from public, anon;
revoke execute on function app_treatment_by_thread(text) from public, anon;
