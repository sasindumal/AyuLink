-- ==============================================
-- AyuLink - Don't block unverified accounts (for now)
--
-- Self-registered doctors/pharmacies were blocked from issuing
-- prescriptions, managing their schedule, or dispensing until an
-- admin manually flipped "verified" on their User row. Per product
-- decision, that gate is off for now — verification still exists as
-- a flag (and could gate something else later) but no longer blocks
-- any action. Re-published functions are otherwise byte-for-byte the
-- same as their prior version, verified-check removed.
-- ==============================================

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

create or replace function app_upsert_schedule_slot(
    p_id uuid,
    p_channeling_center_id uuid,
    p_day_of_week "DayOfWeek",
    p_start_time time,
    p_end_time time
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    v_row "DoctorSchedule";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'DOCTOR' then
        raise exception 'Only doctors can manage a channeling schedule';
    end if;
    if p_end_time <= p_start_time then
        raise exception 'End time must be after start time';
    end if;
    if not exists (select 1 from "ChannelingCenter" where "id" = p_channeling_center_id) then
        raise exception 'Channeling center not found';
    end if;

    if p_id is null then
        insert into "DoctorSchedule" (
            "doctor_id", "channeling_center_id", "day_of_week", "start_time", "end_time"
        )
        values (me."id", p_channeling_center_id, p_day_of_week, p_start_time, p_end_time)
        returning * into v_row;
    else
        update "DoctorSchedule" set
            "channeling_center_id" = p_channeling_center_id,
            "day_of_week"          = p_day_of_week,
            "start_time"           = p_start_time,
            "end_time"             = p_end_time
        where "id" = p_id and "doctor_id" = me."id"
        returning * into v_row;

        if not found then
            raise exception 'Schedule slot not found';
        end if;
    end if;

    return to_jsonb(v_row);
exception
    when unique_violation then
        raise exception 'You already have a schedule slot at this center, day, and start time';
end $$;

create or replace function app_dispense_item(
    p_prescription_id uuid,
    p_item_id uuid,
    p_dispensed boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    result jsonb;
    p "Prescription";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PHARMACIST' then
        raise exception 'Only pharmacists can dispense medications';
    end if;

    begin
        result := dispense_prescription_item(p_prescription_id, p_item_id, p_dispensed, me."id");
    exception
        when others then
            case SQLERRM
                when 'PRESCRIPTION_NOT_FOUND' then raise exception 'Prescription not found';
                when 'ITEM_NOT_FOUND' then raise exception 'Item not found in this prescription';
                when 'NOT_DISPENSED' then raise exception 'This item has not been dispensed yet';
                when 'REVERT_WINDOW_EXPIRED' then raise exception 'Cannot revert — the 15-minute window has expired';
                when 'EXPIRED' then raise exception 'This prescription has expired and can no longer be dispensed';
                else raise;
            end case;
    end;

    select * into p from "Prescription" where "id" = p_prescription_id;
    return jsonb_build_object(
        'prescription', prescription_json(p),
        'drugName', result->>'drugName',
        'allDispensed', (result->>'allDispensed')::boolean
    );
end $$;

create or replace function app_lookup_prescription_by_id(p_prescription_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    p "Prescription";
    v_json jsonb;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PHARMACIST' then
        raise exception 'Only pharmacists can look up prescriptions';
    end if;

    select * into p from "Prescription" where "id" = p_prescription_id;
    if p is null then
        raise exception 'Prescription not found';
    end if;

    v_json := prescription_json(p);
    if v_json->>'status' = 'FULLY_DISPENSED' then
        raise exception 'This prescription has already been fully dispensed';
    end if;
    if v_json->>'status' = 'EXPIRED' then
        raise exception 'This prescription has expired and can no longer be dispensed';
    end if;

    return v_json;
end $$;
