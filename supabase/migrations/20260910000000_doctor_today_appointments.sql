-- ==============================================
-- AyuLink - Doctor's own daily clinic list
--
-- Nothing previously let a doctor list their OWN appointments —
-- app_list_my_appointments() is patient-only, app_doctor_appointments_
-- for_patient() is scoped to one already-known patient. The doctor
-- app's home screen needs "who's on my list today", independent of
-- having scanned anyone yet.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

-- The caller-doctor's own appointments on one date (default today),
-- soonest first, enriched with the linked AI triage (if any) the same
-- way app_doctor_appointments_for_patient() already does — so the
-- clinic list can show "AI triage: X" without a second round trip.
create or replace function app_doctor_today_appointments(p_date date default current_date)
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
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors have a clinic list';
    end if;

    select coalesce(jsonb_agg(row_json order by start_time), '[]'::jsonb)
    into result
    from (
        select
            a."start_time" as start_time,
            jsonb_build_object(
                'id', a."id",
                'orderNumber', a."order_number",
                'status', a."status",
                'appointmentDate', a."appointment_date",
                'startTime', a."start_time",
                'endTime', a."end_time",
                'doctorStartedAt', a."doctor_started_at",
                'patient', jsonb_build_object(
                    'id', pu."id", 'firstName', pu."firstName", 'lastName', pu."lastName",
                    'medicalId', pu."medicalId"
                ),
                'channelingCenter', (
                    select jsonb_build_object('id', cc."id", 'name', cc."name", 'city', cc."city")
                    from "ChannelingCenter" cc where cc."id" = a."channeling_center_id"
                ),
                'treatment', (
                    select jsonb_build_object(
                        'id', t."id",
                        'diseaseName', coalesce(t."confirmed_diagnosis", t."disease_name"),
                        'specialty', t."specialty"
                    )
                    from "Treatment" t
                    where t."appointment_id" = a."id"
                    order by t."created_at" desc
                    limit 1
                ),
                'prescriptionId', (
                    select pr."id" from "Prescription" pr
                    where pr."appointment_id" = a."id"
                    order by pr."dateIssued" desc
                    limit 1
                )
            ) as row_json
        from "Appointment" a
        join "User" pu on pu."id" = a."patient_id"
        where a."doctor_id" = me."id"
          and a."appointment_date" = p_date
          and a."status" = 'BOOKED'
    ) s;

    return result;
end $$;

revoke execute on function app_doctor_today_appointments(date) from public, anon;
