-- ==============================================
-- AyuLink - app_update_prescription / app_delete_prescription
-- also explicitly refuse an EXPIRED prescription, not just one
-- with dispensed items. In practice the 1-day edit window and
-- the 1-day minimum expiry duration mean these rarely overlap,
-- but an explicit check keeps the guarantee correct even if
-- either constant changes later, and gives a clearer error.
-- ==============================================

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
    if presc."expires_at" is not null and now() > presc."expires_at" then
        raise exception 'This prescription has expired and can no longer be edited';
    end if;
    if presc."status" in ('PARTIALLY_DISPENSED', 'FULLY_DISPENSED') or exists (
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
    if presc."expires_at" is not null and now() > presc."expires_at" then
        raise exception 'This prescription has expired and can no longer be deleted';
    end if;
    if presc."status" in ('PARTIALLY_DISPENSED', 'FULLY_DISPENSED') or exists (
        select 1 from "PrescriptionItem" where "prescriptionId" = p_prescription_id and "dispensed"
    ) then
        raise exception 'Cannot delete — some medications on this prescription have already been dispensed';
    end if;

    update "Treatment" set "confirmed_diagnosis" = null, "confirming_prescription_id" = null
    where "confirming_prescription_id" = p_prescription_id;

    delete from "Prescription" where "id" = p_prescription_id;
end $$;
