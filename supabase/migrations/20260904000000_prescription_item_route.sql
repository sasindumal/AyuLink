-- ==============================================
-- AyuLink - Route of administration per medication
--
-- Adds "route" (Oral, Topical, IV, IM, ...) to each
-- PrescriptionItem, alongside the existing dosage/frequency/
-- duration. Defaults to 'Oral' at the DB level so existing rows
-- and any client that doesn't send one stay valid — mirrors how
-- "instructions" is already optional with a default.
-- ==============================================

alter table "PrescriptionItem" add column if not exists "route" text not null default 'Oral';

-- ----- Internal functions -----

create or replace function create_prescription_with_items(
    p_patient_id     uuid,
    p_doctor_id      uuid,
    p_diagnosis      text,
    p_items          jsonb,
    p_expiry_days    int default 30,
    p_patient_age    int default null,
    p_patient_weight numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_id uuid;
    item jsonb;
begin
    insert into "Prescription" (
        "patientId", "doctorId", "diagnosis", "expires_at", "patient_age", "patient_weight_kg"
    )
    values (
        p_patient_id, p_doctor_id, p_diagnosis,
        case when p_expiry_days is null then null else now() + (p_expiry_days || ' days')::interval end,
        p_patient_age, p_patient_weight
    )
    returning "id" into v_id;

    for item in select * from jsonb_array_elements(p_items) loop
        insert into "PrescriptionItem" (
            "prescriptionId", "drugName", "dosage", "frequency", "duration", "route", "instructions"
        )
        values (
            v_id,
            item->>'drugName',
            item->>'dosage',
            item->>'frequency',
            item->>'duration',
            coalesce(nullif(trim(item->>'route'), ''), 'Oral'),
            coalesce(item->>'instructions', '')
        );
    end loop;

    return v_id;
end $$;

-- ----- App functions -----

create or replace function app_update_prescription(
    p_prescription_id uuid,
    p_diagnosis       text,
    p_items           jsonb,
    p_expiry_days     int default 30,
    p_patient_age     int default null,
    p_patient_weight  numeric default null
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
    if p_patient_age is not null and (p_patient_age < 0 or p_patient_age > 150) then
        raise exception 'Age must be between 0 and 150';
    end if;
    if p_patient_weight is not null and (p_patient_weight <= 0 or p_patient_weight > 500) then
        raise exception 'Weight must be between 0 and 500 kg';
    end if;

    delete from "PrescriptionItem" where "prescriptionId" = p_prescription_id;
    for item in select * from jsonb_array_elements(p_items) loop
        insert into "PrescriptionItem" (
            "prescriptionId", "drugName", "dosage", "frequency", "duration", "route", "instructions"
        )
        values (
            p_prescription_id,
            item->>'drugName', item->>'dosage', item->>'frequency', item->>'duration',
            coalesce(nullif(trim(item->>'route'), ''), 'Oral'),
            coalesce(item->>'instructions', '')
        );
    end loop;

    update "Prescription" set
        "diagnosis"          = trim(p_diagnosis),
        "status"             = 'NOT_DISPENSED',
        "expires_at"         = case when p_expiry_days is null then null
                                    else presc."dateIssued" + (p_expiry_days || ' days')::interval end,
        "patient_age"        = p_patient_age,
        "patient_weight_kg"  = p_patient_weight
    where "id" = p_prescription_id;

    update "Treatment" set "confirmed_diagnosis" = trim(p_diagnosis)
    where "confirming_prescription_id" = p_prescription_id;

    select * into p from "Prescription" where "id" = p_prescription_id;
    return prescription_json(p);
end $$;
