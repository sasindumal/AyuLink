-- ==============================================
-- AyuLink - Treatment Management + Per-Patient Order Numbers
--
-- Additive on top of 20260825000000_treatments_notifications.sql.
--   * app_delete_treatment: patients can delete a Treatment record
--     (does not touch a linked Appointment, if any).
--   * app_unlink_treatment_appointment: used when a booking tied to
--     a Treatment is cancelled via the Diagnosis chat, so the
--     Treatment reverts to DIAGNOSED and can be re-booked.
--   * app_book_appointment re-published: order_number changes from
--     a global sequence ("APT-000123") to a per-patient one
--     ("APT-<nicNumber>-0001", ascending, assigned once and never
--     renumbered). Serialized per patient via an advisory xact lock
--     so two concurrent bookings by the same patient can't collide.
-- ==============================================

create or replace function app_delete_treatment(p_treatment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
    me "User";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;

    delete from "Treatment" where "id" = p_treatment_id and "patient_id" = me."id";
    if not found then
        raise exception 'Treatment not found';
    end if;
end $$;

-- Reverts a Treatment to DIAGNOSED (unbooked) — used when the chat
-- cancels the appointment it was linked to, so the patient can book
-- a different doctor/slot for the same diagnosis.
create or replace function app_unlink_treatment_appointment(p_treatment_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    t "Treatment";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;

    update "Treatment" set "appointment_id" = null, "status" = 'DIAGNOSED'
    where "id" = p_treatment_id and "patient_id" = me."id"
    returning * into t;
    if t is null then
        raise exception 'Treatment not found';
    end if;

    return treatment_json(t);
end $$;

-- Re-published: order_number is now per-patient ("APT-<nicNumber>-0001",
-- ascending, e.g. a patient's 1st ever booking is always -0001) instead
-- of a single global counter shared by everyone.
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
    v_seq int;
    v_order_number text;
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

    -- Serialize per-patient order-number assignment so two concurrent
    -- bookings by the same patient can't compute the same sequence number.
    perform pg_advisory_xact_lock(hashtext(me."id"::text));
    select count(*) + 1 into v_seq from "Appointment" where "patient_id" = me."id";
    v_order_number := 'APT-' || me."nicNumber" || '-' || lpad(v_seq::text, 4, '0');

    insert into "Appointment" (
        "order_number", "patient_id", "doctor_id", "channeling_center_id", "doctor_schedule_id",
        "appointment_date", "start_time", "end_time", "reason"
    ) values (
        v_order_number, me."id", sched."doctor_id", sched."channeling_center_id", sched."id",
        p_appointment_date, sched."start_time", sched."end_time", nullif(trim(p_reason), '')
    )
    returning "id" into v_id;

    select * into a from "Appointment" where "id" = v_id;
    return appointment_json(a);
exception
    when unique_violation then
        raise exception 'This slot was just booked by someone else. Please choose another time.';
end $$;

-- ----- Function grants -----

revoke execute on function app_delete_treatment(uuid) from public, anon;
revoke execute on function app_unlink_treatment_appointment(uuid) from public, anon;
revoke execute on function app_book_appointment(uuid, date, text) from public, anon;
