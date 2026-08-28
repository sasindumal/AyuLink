-- ==============================================
-- AyuLink - Deleting a diagnosis must not be blocked by its appointment
--
-- Treatment and Appointment reference each other both ways:
--     "Treatment"."appointment_id"  -> Appointment
--     "Appointment"."treatment_id"  -> Treatment   (the problem)
--
-- app_delete_treatment() deleted the Treatment row without first
-- clearing the back-reference, and Appointment_treatment_id_fkey has no
-- ON DELETE action — so Postgres refused with:
--
--     update or delete on table "Treatment" violates foreign key
--     constraint "Appointment_treatment_id_fkey" on table "Appointment"
--
-- The effect: any diagnosis that ever reached a booking could never be
-- deleted. Only a never-booked diagnosis could — which is the small
-- minority, so in practice Delete was broken for most of the list.
--
-- Two changes, deliberately belt-and-braces:
--
-- 1. The constraint becomes ON DELETE SET NULL, so no delete path
--    anywhere can reintroduce this — including cascades and any future
--    RPC that forgets the unlink.
-- 2. app_delete_treatment() clears the back-reference explicitly first,
--    so the intent is visible in the function rather than hidden in a
--    constraint definition nobody reads.
--
-- The APPOINTMENT SURVIVES. Deleting an AI diagnosis is deleting a note;
-- it must not silently destroy a real booking the patient still has with
-- a real doctor. The appointment stays in "My Appointments" exactly as
-- before, minus the "came from this diagnosis" link. Cancelling is a
-- separate, explicit action — app_cancel_appointment.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

alter table "Appointment"
    drop constraint if exists "Appointment_treatment_id_fkey";

alter table "Appointment"
    add constraint "Appointment_treatment_id_fkey"
    foreign key ("treatment_id") references "Treatment" ("id")
    on delete set null;


-- Re-published: unlinks any appointment pointing back at this treatment
-- before deleting it. Ownership is still checked on the Treatment row
-- itself, so this cannot be used to touch someone else's appointment.
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

    -- Scoped by the same patient_id the delete below is scoped by, so a
    -- caller can only ever clear the link on their own appointment.
    update "Appointment" a
       set "treatment_id" = null
      from "Treatment" t
     where t."id" = p_treatment_id
       and t."patient_id" = me."id"
       and a."treatment_id" = t."id";

    delete from "Treatment" where "id" = p_treatment_id and "patient_id" = me."id";
    if not found then
        raise exception 'Treatment not found';
    end if;
end $$;

revoke execute on function app_delete_treatment(uuid) from public, anon;
