-- ==============================================
-- AyuLink - Care timeline: how the visit ended
--
-- app_treatment_timeline() emitted DIAGNOSED -> APPOINTMENT_BOOKED ->
-- APPOINTMENT_STARTED -> PRESCRIPTION_ISSUED -> ITEM_DISPENSED, and then
-- simply stopped. The 'APPOINTMENT_COMPLETED' and 'APPOINTMENT_CANCELLED'
-- constants existed (see 20260908000000_care_event_notification_types),
-- and both actions worked and notified correctly — but neither ever
-- reached the timeline, because the builder had no branch for them.
--
-- The visible symptom: a channeling center marks a visit complete, the
-- appointment's own status flips to COMPLETED everywhere else in the
-- app, and the patient's care timeline still shows the booking as the
-- last thing that happened to it. A cancelled appointment was worse — it
-- sat on the timeline as a live booking with nothing after it.
--
-- Two changes:
--
-- 1. "Appointment"."completed_at". There was no completion timestamp at
--    all (cancelled_at existed; its counterpart never did), so a
--    COMPLETED event had nothing honest to date itself by.
--    app_complete_appointment now stamps it.
--
--    Existing COMPLETED rows are backfilled from "updated_at", which is
--    trigger-maintained and — because marking complete is the last write
--    an appointment normally receives — is the completion time in
--    practice. It is an approximation for historical rows only; every
--    completion from here on records the real thing. Deliberately NOT
--    left null and hidden from the timeline instead: dropping the event
--    for every visit completed before today would misrepresent finished
--    care as unfinished, which is the exact bug being fixed.
--
-- 2. app_treatment_timeline() re-published with the two closing events.
--
-- Note on cancellations booked through the chat: booking_agent unlinks
-- the Treatment when it cancels, so t."appointment_id" is already null
-- and no appointment events (booked OR cancelled) appear for those. This
-- fixes the UI-cancelled case, where the link is kept and the timeline
-- was actively misleading.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

alter table "Appointment"
    add column if not exists "completed_at" timestamptz;

comment on column "Appointment"."completed_at" is
    'When a channeling center marked this visit complete. Backfilled from updated_at for rows completed before this column existed.';

update "Appointment"
   set "completed_at" = "updated_at"
 where "status" = 'COMPLETED'
   and "completed_at" is null;


-- Re-published: records completed_at. Body is otherwise unchanged from
-- 20260822000000_appointments.sql.
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

    update "Appointment"
       set "status" = 'COMPLETED',
           "completed_at" = now()
     where "id" = p_appointment_id
    returning * into appt;
    return appointment_json(appt);
end $$;

revoke execute on function app_complete_appointment(uuid) from public, anon;


-- Re-published in full from 20260911000000_timeline_early_events.sql.
-- Only section 2's union changes: two more branches, for the two ways a
-- booked appointment actually ends.
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

    -- 1. The diagnosis itself — always present, so the timeline always
    --    has at least one entry to show.
    v_events := jsonb_build_array(jsonb_build_object(
        'key', 'diagnosed:' || t."id",
        'type', 'DIAGNOSED',
        'at', t."created_at",
        'payload', jsonb_build_object(
            'diseaseName', coalesce(t."confirmed_diagnosis", t."disease_name"),
            'specialty', t."specialty"
        )
    ));

    -- 2. The booking, the visit starting, and how it ended. All read from
    --    the linked appointment; each event only appears once there is
    --    real evidence it happened.
    v_events := v_events || coalesce((
        select jsonb_agg(e order by ord)
        from (
            select 1 as ord, jsonb_build_object(
                'key', 'appt_booked:' || a."id",
                'type', 'APPOINTMENT_BOOKED',
                'at', a."created_at",
                'payload', jsonb_build_object(
                    'doctorName', 'Dr. ' || du."firstName" || ' ' || du."lastName",
                    'specialty', ddp."specialty",
                    'centerName', cc."name",
                    'orderNumber', a."order_number",
                    'appointmentDate', a."appointment_date",
                    'startTime', a."start_time",
                    'status', a."status"
                )
            ) as e
            from "Appointment" a
            join "User" du on du."id" = a."doctor_id"
            left join "DoctorProfile" ddp on ddp."user_id" = a."doctor_id"
            left join "ChannelingCenter" cc on cc."id" = a."channeling_center_id"
            where a."id" = t."appointment_id"

            union all

            select 2 as ord, jsonb_build_object(
                'key', 'appt_started:' || a."id",
                'type', 'APPOINTMENT_STARTED',
                -- Pre-dating doctor_started_at, a COMPLETED appointment is
                -- still proof the visit happened — fall back to its slot.
                'at', coalesce(
                    a."doctor_started_at",
                    (a."appointment_date" + a."start_time")::timestamptz
                ),
                'payload', jsonb_build_object(
                    'doctorName', 'Dr. ' || du."firstName" || ' ' || du."lastName",
                    'specialty', ddp."specialty",
                    'centerName', cc."name",
                    'orderNumber', a."order_number"
                )
            ) as e
            from "Appointment" a
            join "User" du on du."id" = a."doctor_id"
            left join "DoctorProfile" ddp on ddp."user_id" = a."doctor_id"
            left join "ChannelingCenter" cc on cc."id" = a."channeling_center_id"
            where a."id" = t."appointment_id"
              and (a."doctor_started_at" is not null or a."status" = 'COMPLETED')

            union all

            -- 2c. The channeling center closed the visit out.
            select 3 as ord, jsonb_build_object(
                'key', 'appt_completed:' || a."id",
                'type', 'APPOINTMENT_COMPLETED',
                -- completed_at is backfilled for historical rows and set
                -- for real going forward; the scheduled slot is a last
                -- resort so this event can never sort to the top of the
                -- timeline on a null date.
                'at', coalesce(
                    a."completed_at",
                    a."updated_at",
                    (a."appointment_date" + a."end_time")::timestamptz
                ),
                'payload', jsonb_build_object(
                    'doctorName', 'Dr. ' || du."firstName" || ' ' || du."lastName",
                    'specialty', ddp."specialty",
                    'centerName', cc."name",
                    'orderNumber', a."order_number"
                )
            ) as e
            from "Appointment" a
            join "User" du on du."id" = a."doctor_id"
            left join "DoctorProfile" ddp on ddp."user_id" = a."doctor_id"
            left join "ChannelingCenter" cc on cc."id" = a."channeling_center_id"
            where a."id" = t."appointment_id"
              and a."status" = 'COMPLETED'

            union all

            -- 2d. Or it was cancelled. Carries who cancelled it and why,
            --     so the patient isn't left guessing at a booking that
            --     silently stopped existing.
            select 4 as ord, jsonb_build_object(
                'key', 'appt_cancelled:' || a."id",
                'type', 'APPOINTMENT_CANCELLED',
                'at', coalesce(a."cancelled_at", a."updated_at"),
                'payload', jsonb_build_object(
                    'doctorName', 'Dr. ' || du."firstName" || ' ' || du."lastName",
                    'specialty', ddp."specialty",
                    'centerName', cc."name",
                    'orderNumber', a."order_number",
                    'reason', a."cancelled_reason",
                    -- ::text on purpose — the client reads this as a
                    -- plain role string, not a Postgres enum.
                    'cancelledByRole', cbu."role"::text
                )
            ) as e
            from "Appointment" a
            join "User" du on du."id" = a."doctor_id"
            left join "DoctorProfile" ddp on ddp."user_id" = a."doctor_id"
            left join "ChannelingCenter" cc on cc."id" = a."channeling_center_id"
            left join "User" cbu on cbu."id" = a."cancelled_by"
            where a."id" = t."appointment_id"
              and a."status" = 'CANCELLED'
        ) s
    ), '[]'::jsonb);

    -- 3. The prescription issued at that visit (if any).
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
    -- nullable column is empty.
    if v_presc."id" is not null then
        v_events := v_events || jsonb_build_array(jsonb_build_object(
            'key', 'rx_issued:' || v_presc."id",
            'type', 'PRESCRIPTION_ISSUED',
            'at', v_presc."dateIssued",
            'payload', prescription_json(v_presc)
        ));

        -- 4. Each drug as it gets dispensed.
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

        select
            max(i."dispensedAt" + (parse_duration_days(i."duration") || ' days')::interval),
            bool_or(parse_duration_days(i."duration") is null)
        into v_course_end, v_any_open_ended
        from "PrescriptionItem" i
        where i."prescriptionId" = v_presc."id" and i."dispensed" and i."dispensedAt" is not null;
    end if;

    -- Chronological, regardless of the order the sections built them in.
    select coalesce(jsonb_agg(e order by (e->>'at')::timestamptz nulls last), '[]'::jsonb)
    into v_events
    from jsonb_array_elements(v_events) e;

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

revoke execute on function app_treatment_timeline(uuid) from public, anon;
