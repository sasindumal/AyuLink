-- ==============================================
-- AyuLink - Prescription expiry + Treatment name confirmation
--
--   * "Prescription".expires_at - set at issue time from the
--     doctor's chosen expiry duration (days, or null = never).
--     prescription_json() derives an 'EXPIRED' status once it's
--     passed — never stored as a real PrescriptionStatus value,
--     so no enum change needed. A null expires_at ('Never')
--     means the prescription can never become EXPIRED, no matter
--     its dispensed state.
--   * "Treatment".confirmed_diagnosis - the AI's disease_name is
--     never shown to the patient directly; treatment_json() shows
--     a stable demo placeholder ("DiagnosisXXXX") until a doctor
--     who saw this patient for the linked appointment issues a
--     prescription, at which point that prescription's diagnosis
--     text becomes the confirmed, displayed treatment name.
-- ==============================================

alter table "Prescription" add column if not exists "expires_at" timestamptz null;
alter table "Treatment" add column if not exists "confirmed_diagnosis" text null;

-- ----- Internal functions -----

drop function if exists create_prescription_with_items(uuid, uuid, text, jsonb);

create or replace function create_prescription_with_items(
    p_patient_id   uuid,
    p_doctor_id    uuid,
    p_diagnosis    text,
    p_items        jsonb,
    p_expiry_days  int default 30
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_id uuid;
    item jsonb;
begin
    insert into "Prescription" ("patientId", "doctorId", "diagnosis", "expires_at")
    values (
        p_patient_id, p_doctor_id, p_diagnosis,
        case when p_expiry_days is null then null else now() + (p_expiry_days || ' days')::interval end
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

-- Serialize a prescription, matching the shape the web API and
-- mobile apps expect. 'status' is overridden to the derived
-- 'EXPIRED' once expires_at has passed — the stored
-- PrescriptionStatus column is untouched (dispensing logic is
-- unaffected), this only changes what apps are shown.
create or replace function prescription_json(p "Prescription")
returns jsonb
language sql stable security definer set search_path = public as $$
    select to_jsonb(p) || jsonb_build_object(
        'status', case
            when p."expires_at" is not null and now() > p."expires_at" then 'EXPIRED'
            else p."status"::text
        end,
        'expiresAt', p."expires_at",
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

-- Displayed treatment name: a stable demo placeholder until a
-- doctor's prescription confirms it (see app_create_prescription).
create or replace function treatment_json(t "Treatment")
returns jsonb
language sql stable security definer set search_path = public as $$
    select to_jsonb(t) || jsonb_build_object(
        'disease_name', coalesce(t."confirmed_diagnosis", 'Diagnosis' || upper(substr(t."id"::text, 1, 4))),
        'status', case
            when exists (
                select 1 from "Appointment" a
                where a."id" = t."appointment_id" and a."status" = 'COMPLETED'
            ) then 'COMPLETED'
            else t."status"
        end,
        'appointment', (
            select jsonb_build_object(
                'id', a."id", 'orderNumber', a."order_number", 'status', a."status",
                'appointmentDate', a."appointment_date", 'startTime', a."start_time"
            ) from "Appointment" a where a."id" = t."appointment_id"
        )
    )
$$;

-- ----- App functions -----

drop function if exists app_create_prescription(uuid, text, jsonb);

-- Issue a prescription (verified doctors only). p_expiry_days is
-- the number of days from now before it becomes EXPIRED (default
-- 30); pass null for "Never expires". If this doctor has a
-- not-yet-confirmed Treatment for this patient from a booked
-- appointment with them, this prescription's diagnosis becomes
-- that treatment's confirmed, displayed name.
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

    update "Treatment" set "confirmed_diagnosis" = trim(p_diagnosis)
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

revoke execute on function app_create_prescription(uuid, text, jsonb, int) from public, anon;

-- Re-published: a pharmacist's per-prescription QR lookup must
-- also refuse an EXPIRED prescription (derived from expires_at,
-- see prescription_json() above), not just a FULLY_DISPENSED one —
-- an archived prescription is no longer valid to dispense against.
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
    if not me."verified" then
        raise exception 'Your account is pending verification. You cannot dispense medications yet';
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

-- Re-published: dispensing (not reverting) is now refused once a
-- prescription has expired — closes the gap where a stale client
-- could call this directly, bypassing the app_lookup_prescription_by_id
-- guard above. Reverting an already-dispensed item within its
-- 15-minute window is still allowed regardless of expiry, since
-- it corrects a mistake rather than dispensing anything new.
create or replace function dispense_prescription_item(
    p_prescription_id uuid,
    p_item_id uuid,
    p_dispensed boolean,
    p_pharmacist_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_presc "Prescription";
    v_item "PrescriptionItem";
    v_all boolean;
    v_any boolean;
    v_status "PrescriptionStatus";
begin
    select * into v_presc from "Prescription" where "id" = p_prescription_id for update;
    if not found then
        raise exception 'PRESCRIPTION_NOT_FOUND';
    end if;
    if p_dispensed and v_presc."expires_at" is not null and now() > v_presc."expires_at" then
        raise exception 'EXPIRED';
    end if;

    select * into v_item
    from "PrescriptionItem"
    where "id" = p_item_id and "prescriptionId" = p_prescription_id
    for update;

    if not found then
        raise exception 'ITEM_NOT_FOUND';
    end if;

    if not p_dispensed then
        if not v_item."dispensed" or v_item."dispensedAt" is null then
            raise exception 'NOT_DISPENSED';
        end if;
        if v_item."dispensedAt" < now() - interval '15 minutes' then
            raise exception 'REVERT_WINDOW_EXPIRED';
        end if;
    end if;

    update "PrescriptionItem" set
        "dispensed"     = p_dispensed,
        "dispensedAt"   = case when p_dispensed then now() else null end,
        "dispensedById" = case when p_dispensed then p_pharmacist_id else null end
    where "id" = p_item_id
    returning * into v_item;

    select bool_and("dispensed"), bool_or("dispensed")
    into v_all, v_any
    from "PrescriptionItem"
    where "prescriptionId" = p_prescription_id;

    v_status := case
        when v_all then 'FULLY_DISPENSED'
        when v_any then 'PARTIALLY_DISPENSED'
        else 'NOT_DISPENSED'
    end;

    update "Prescription" set "status" = v_status where "id" = p_prescription_id;

    return jsonb_build_object(
        'itemId', v_item."id",
        'drugName', v_item."drugName",
        'allDispensed', v_all
    );
end $$;

-- Re-published: maps the new EXPIRED exception from
-- dispense_prescription_item() to a friendly message.
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
    if not me."verified" then
        raise exception 'Your account is pending verification. You cannot dispense medications yet';
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
