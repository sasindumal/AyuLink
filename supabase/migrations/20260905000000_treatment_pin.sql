-- ==============================================
-- AyuLink - Pin a Diagnosis
--
-- Additive on top of 20260825000000_treatments_notifications.sql.
-- Adds a "pinned" flag to "Treatment" so a patient can pin specific
-- diagnoses to the top of the (renamed) Diagnoses tab, plus an RPC
-- to toggle it. treatment_json() already serializes the whole row
-- via to_jsonb(t), so "pinned" appears in its output automatically
-- — no change needed there.
--
-- Run via `supabase db push` or paste into the SQL Editor, same as
-- prior migrations.
-- ==============================================

alter table "Treatment" add column "pinned" boolean not null default false;

-- Toggles pinned on/off for one of the caller's own treatments and
-- returns the updated row. Same ownership-check shape as
-- app_link_treatment_appointment.
create or replace function app_toggle_treatment_pin(p_treatment_id uuid)
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

    select * into t from "Treatment" where "id" = p_treatment_id and "patient_id" = me."id" for update;
    if t is null then
        raise exception 'Treatment not found';
    end if;

    update "Treatment" set "pinned" = not "pinned"
    where "id" = p_treatment_id
    returning * into t;

    return treatment_json(t);
end $$;

revoke execute on function app_toggle_treatment_pin(uuid) from public, anon;
