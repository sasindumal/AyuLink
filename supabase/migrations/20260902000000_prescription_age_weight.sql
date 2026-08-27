-- ==============================================
-- AyuLink - Optional patient age/weight on a prescription
-- Recorded by the doctor at issue time (Scan & Prescribe,
-- right after the diagnosis field) and editable within the
-- same 1-day/nothing-dispensed window as the rest of the
-- prescription. Both are optional — useful clinical context
-- (e.g. pediatric/weight-based dosing) but never required.
-- ==============================================

alter table "Prescription" add column if not exists "patient_age" int null;
alter table "Prescription" add column if not exists "patient_weight_kg" numeric(5,2) null;

do $$ begin
    alter table "Prescription" add constraint "Prescription_patient_age_check"
        check ("patient_age" is null or ("patient_age" >= 0 and "patient_age" <= 150));
exception when duplicate_object then null;
end $$;
do $$ begin
    alter table "Prescription" add constraint "Prescription_patient_weight_kg_check"
        check ("patient_weight_kg" is null or ("patient_weight_kg" > 0 and "patient_weight_kg" <= 500));
exception when duplicate_object then null;
end $$;

-- ----- Internal functions -----

drop function if exists create_prescription_with_items(uuid, uuid, text, jsonb, int);

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
            "prescriptionId", "drugName", "dosage", "frequency", "duration", "instructions"
        )
        values (
            v_id,
            item->>'drugName',
            item->>'dosage',
            item->>'frequency',
            item->>'duration',
            coalesce(item->>'instructions', '')
        );
    end loop;

    return v_id;
end $$;

create or replace function prescription_json(p "Prescription")
returns jsonb
language sql stable security definer set search_path = public as $$
    select to_jsonb(p) || jsonb_build_object(
        'status', case
            when p."expires_at" is not null and now() > p."expires_at" then 'EXPIRED'
            else p."status"::text
        end,
        'expiresAt', p."expires_at",
        'patientAge', p."patient_age",
        'patientWeightKg', p."patient_weight_kg",
        'items', coalesce((
            select jsonb_agg(
                to_jsonb(i) || jsonb_build_object(
                    'dispensedBy',
                    case when i."dispensedById" is null then null else (
                        select jsonb_build_object(
                            'id', u."id",
                            'firstName', u."firstName",
                            'lastName', u."lastName",
                            'pharmacyProfile', (
                                select jsonb_build_object(
                                    'pharmacyName', pp."pharmacyName",
                                    'licenseNumber', pp."licenseNumber"
                                )
                                from "PharmacyProfile" pp
                                where pp."userId" = u."id"
                            )
                        )
                        from "User" u where u."id" = i."dispensedById"
                    ) end
                )
                order by i."id"
            )
            from "PrescriptionItem" i
            where i."prescriptionId" = p."id"
        ), '[]'::jsonb),
        'patient', (
            select jsonb_build_object(
                'id', u."id", 'firstName', u."firstName", 'lastName', u."lastName",
                'nicNumber', u."nicNumber", 'medicalId', u."medicalId"
            )
            from "User" u where u."id" = p."patientId"
        ),
        'doctor', (
            select jsonb_build_object(
                'id', u."id", 'firstName', u."firstName", 'lastName', u."lastName",
                'doctorProfile', (
                    select jsonb_build_object(
                        'specialization', dp."specialty",
                        'slmcRegNo', dp."slmc_id",
                        'rating', dp."rating"
                    )
                    from "DoctorProfile" dp where dp."user_id" = u."id"
                )
            )
            from "User" u where u."id" = p."doctorId"
        )
    )
$$;

-- ----- App functions -----

drop function if exists app_create_prescription(uuid, text, jsonb, int);

create or replace function app_create_prescription(
    p_patient_id     uuid,
    p_diagnosis      text,
    p_items          jsonb,
    p_expiry_days    int default 30,
    p_patient_age    int default null,
    p_patient_weight numeric default null
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
    if p_patient_age is not null and (p_patient_age < 0 or p_patient_age > 150) then
        raise exception 'Age must be between 0 and 150';
    end if;
    if p_patient_weight is not null and (p_patient_weight <= 0 or p_patient_weight > 500) then
        raise exception 'Weight must be between 0 and 500 kg';
    end if;

    if not exists (select 1 from "User" where "id" = p_patient_id and "role" = 'PATIENT') then
        raise exception 'Patient not found';
    end if;

    v_id := create_prescription_with_items(
        p_patient_id, me."id", trim(p_diagnosis), p_items, p_expiry_days, p_patient_age, p_patient_weight
    );

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

drop function if exists app_update_prescription(uuid, text, jsonb, int);

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
            "prescriptionId", "drugName", "dosage", "frequency", "duration", "instructions"
        )
        values (
            p_prescription_id,
            item->>'drugName', item->>'dosage', item->>'frequency', item->>'duration',
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

revoke execute on function app_create_prescription(uuid, text, jsonb, int, int, numeric) from public, anon;
revoke execute on function app_update_prescription(uuid, text, jsonb, int, int, numeric) from public, anon;
