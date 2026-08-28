-- ==============================================
-- AyuLink - Care timeline: the events before the visit
--
-- app_treatment_timeline() previously only emitted events that happen
-- once a doctor has actually seen the patient (visit started ->
-- prescription -> dispensing). Every one of those depends on columns
-- introduced alongside the timeline itself (doctor_started_at,
-- Prescription.appointment_id), so for any diagnosis that hasn't been
-- attended yet — which is the normal state right after booking — the
-- timeline came back completely empty, even though the patient had
-- plainly made progress: they were diagnosed, and they booked.
--
-- Two events that ALWAYS exist are now modelled:
--   * DIAGNOSED         — from Treatment.created_at, present for every
--                         treatment, so the timeline is never empty
--   * APPOINTMENT_BOOKED — from the linked Appointment
--
-- Also relaxes APPOINTMENT_STARTED: a COMPLETED appointment is proof
-- the visit happened even when doctor_started_at was never set (true
-- for every appointment predating that column). Its timestamp falls
-- back to the scheduled slot in that case.
--
-- Deliberately NOT backfilling Prescription.appointment_id by guessing
-- at patient+doctor+date proximity: the prescriptions currently on file
-- belong to no treatment at all, and inventing that link would attach
-- fabricated history to a real patient record.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

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

    -- 2. The booking, and 3. the visit actually starting. Both read from
    --    the linked appointment; the visit event only appears once there
    --    is real evidence it happened.
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
        ) s
    ), '[]'::jsonb);

    -- 4. The prescription issued at that visit (if any).
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

        -- 5. Each drug as it gets dispensed.
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
