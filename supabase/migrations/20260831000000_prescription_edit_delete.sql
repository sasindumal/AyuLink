-- ==============================================
-- AyuLink - Doctors can edit or delete a prescription
-- within 1 day of issuing it, as long as nothing on it
-- has been dispensed yet.
--
--   * "Treatment".confirming_prescription_id - which
--     prescription confirmed a treatment's displayed name,
--     so editing/deleting that prescription can keep the
--     treatment name in sync (or revert it to the AI's
--     temporary name on delete) instead of a fragile
--     text match.
--   * app_update_prescription() / app_delete_prescription()
-- ==============================================

alter table "Treatment" add column if not exists "confirming_prescription_id" uuid null
    references "Prescription" ("id") on delete set null;

-- Re-published: also records which prescription confirmed the
-- treatment's name, for app_update_prescription/app_delete_prescription
-- to keep in sync.
create or replace function app_create_prescription(
    p_patient_id   uuid,
    p_diagnosis    text,
    p_items        jsonb,
    p_expiry_days  int default 30
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    item jsonb;
    v_id uuid;
    p "Prescription";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors can issue prescriptions';
    end if;
    if not me."verified" then
        raise exception 'Your account is pending verification. You cannot issue prescriptions yet';
    end if;

    if coalesce(trim(p_diagnosis), '') = '' or length(p_diagnosis) > 500 then
        raise exception 'Please enter a diagnosis (max 500 characters)';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
        raise exception 'A prescription needs between 1 and 50 medication items';
    end if;
    for item in select * from jsonb_array_elements(p_items) loop
        if coalesce(trim(item->>'drugName'), '') = ''
           or coalesce(trim(item->>'dosage'), '') = ''
           or coalesce(trim(item->>'frequency'), '') = ''
           or coalesce(trim(item->>'duration'), '') = '' then
            raise exception 'Each medication needs a drug name, dosage, frequency, and duration';
        end if;
    end loop;
    if p_expiry_days is not null and p_expiry_days < 1 then
        raise exception 'Expiry must be at least 1 day, or left as Never';
    end if;

    if not exists (select 1 from "User" where "id" = p_patient_id and "role" = 'PATIENT') then
        raise exception 'Patient not found';
    end if;

    v_id := create_prescription_with_items(p_patient_id, me."id", trim(p_diagnosis), p_items, p_expiry_days);

    update "Treatment" set
        "confirmed_diagnosis" = trim(p_diagnosis),
        "confirming_prescription_id" = v_id
    where "id" = (
        select t."id" from "Treatment" t
        join "Appointment" a on a."id" = t."appointment_id"
        where t."patient_id" = p_patient_id
          and a."doctor_id" = me."id"
          and t."confirmed_diagnosis" is null
        order by t."created_at" desc
        limit 1
    );

    select * into p from "Prescription" where "id" = v_id;
    return prescription_json(p);
end $$;

-- Edit a prescription the caller issued — only within 1 day of
-- issuing, and only while nothing on it has been dispensed yet.
-- Fully replaces the medication items (same validation as
-- app_create_prescription) and keeps a confirmed treatment name
-- in sync if this prescription is the one that set it.
create or replace function app_update_prescription(
    p_prescription_id uuid,
    p_diagnosis       text,
    p_items           jsonb,
    p_expiry_days     int default 30
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    presc "Prescription";
    item jsonb;
    p "Prescription";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors can edit prescriptions';
    end if;

    select * into presc from "Prescription" where "id" = p_prescription_id for update;
    if presc is null then
        raise exception 'Prescription not found';
    end if;
    if presc."doctorId" <> me."id" then
        raise exception 'You can only edit prescriptions you issued';
    end if;
    if now() - presc."dateIssued" > interval '1 day' then
        raise exception 'Prescriptions can only be edited within 1 day of issuing';
    end if;
    if exists (
        select 1 from "PrescriptionItem" where "prescriptionId" = p_prescription_id and "dispensed"
    ) then
        raise exception 'Cannot edit — some medications on this prescription have already been dispensed';
    end if;

    if coalesce(trim(p_diagnosis), '') = '' or length(p_diagnosis) > 500 then
        raise exception 'Please enter a diagnosis (max 500 characters)';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
        raise exception 'A prescription needs between 1 and 50 medication items';
    end if;
    for item in select * from jsonb_array_elements(p_items) loop
        if coalesce(trim(item->>'drugName'), '') = ''
           or coalesce(trim(item->>'dosage'), '') = ''
           or coalesce(trim(item->>'frequency'), '') = ''
           or coalesce(trim(item->>'duration'), '') = '' then
            raise exception 'Each medication needs a drug name, dosage, frequency, and duration';
        end if;
    end loop;
    if p_expiry_days is not null and p_expiry_days < 1 then
        raise exception 'Expiry must be at least 1 day, or left as Never';
    end if;

    delete from "PrescriptionItem" where "prescriptionId" = p_prescription_id;
    for item in select * from jsonb_array_elements(p_items) loop
        insert into "PrescriptionItem" (
            "prescriptionId", "drugName", "dosage", "frequency", "duration", "instructions"
        )
        values (
            p_prescription_id,
            item->>'drugName', item->>'dosage', item->>'frequency', item->>'duration',
            coalesce(item->>'instructions', '')
        );
    end loop;

    update "Prescription" set
        "diagnosis"  = trim(p_diagnosis),
        "status"     = 'NOT_DISPENSED',
        "expires_at" = case when p_expiry_days is null then null
                            else presc."dateIssued" + (p_expiry_days || ' days')::interval end
    where "id" = p_prescription_id;

    update "Treatment" set "confirmed_diagnosis" = trim(p_diagnosis)
    where "confirming_prescription_id" = p_prescription_id;

    select * into p from "Prescription" where "id" = p_prescription_id;
    return prescription_json(p);
end $$;

-- Delete a prescription the caller issued — same 1-day / nothing
-- dispensed guard as editing. Reverts any treatment name it had
-- confirmed back to the AI's temporary name.
create or replace function app_delete_prescription(p_prescription_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    presc "Prescription";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors can delete prescriptions';
    end if;

    select * into presc from "Prescription" where "id" = p_prescription_id for update;
    if presc is null then
        raise exception 'Prescription not found';
    end if;
    if presc."doctorId" <> me."id" then
        raise exception 'You can only delete prescriptions you issued';
    end if;
    if now() - presc."dateIssued" > interval '1 day' then
        raise exception 'Prescriptions can only be deleted within 1 day of issuing';
    end if;
    if exists (
        select 1 from "PrescriptionItem" where "prescriptionId" = p_prescription_id and "dispensed"
    ) then
        raise exception 'Cannot delete — some medications on this prescription have already been dispensed';
    end if;

    update "Treatment" set "confirmed_diagnosis" = null, "confirming_prescription_id" = null
    where "confirming_prescription_id" = p_prescription_id;

    delete from "Prescription" where "id" = p_prescription_id;
end $$;

revoke execute on function app_update_prescription(uuid, text, jsonb, int) from public, anon;
revoke execute on function app_delete_prescription(uuid) from public, anon;
