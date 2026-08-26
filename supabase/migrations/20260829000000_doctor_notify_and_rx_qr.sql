-- ==============================================
-- AyuLink - Doctor notifications + per-prescription QR lookup
--
--   * notify_appointment_change() re-published to also notify
--     the doctor (previously only patient + channeling center),
--     so the doctor apps' new Notifications screen has content.
--   * app_lookup_prescription_by_id() - a pharmacist scanning a
--     patient's per-prescription QR (the prescription's own id,
--     not their Medical ID) gets back exactly that one
--     prescription, never the patient's other pending Rx. A
--     fully-dispensed prescription refuses the lookup outright,
--     so its QR can no longer be used to dispense anything.
-- ==============================================

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
    from unnest(array[NEW."patient_id", NEW."doctor_id", v_center."user_id"]) as uid;

    select array_agg(distinct dt."token") into v_tokens
    from "DeviceToken" dt
    where dt."user_id" in (NEW."patient_id", NEW."doctor_id", v_center."user_id");

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

-- A pharmacist scanning a prescription's own QR code (its id, not
-- the patient's Medical ID) gets back exactly this one
-- prescription — never the patient's other pending prescriptions.
create or replace function app_lookup_prescription_by_id(p_prescription_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    p "Prescription";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PHARMACIST' then
        raise exception 'Only pharmacists can look up prescriptions';
    end if;
    if not me."verified" then
        raise exception 'Your account is pending verification. You cannot dispense medications yet';
    end if;

    select * into p from "Prescription" where "id" = p_prescription_id;
    if p is null then
        raise exception 'Prescription not found';
    end if;
    if p."status" = 'FULLY_DISPENSED' then
        raise exception 'This prescription has already been fully dispensed';
    end if;

    return prescription_json(p);
end $$;

revoke execute on function app_lookup_prescription_by_id(uuid) from public, anon;
