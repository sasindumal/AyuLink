-- ==============================================
-- AyuLink - let the Ayu check-in clock actually be cleared
--
-- app_save_my_health_profile updated every column with
-- coalesce(new, existing), which reads a JSON null as "no value supplied"
-- and keeps whatever was there. For most fields that is exactly right —
-- an omitted key must not wipe data. For "ayu_last_prompted_at" it made
-- the value write-only: it could be pushed forward (dismissing the bubble
-- snoozes for a month) but never reset. The agent's own save has been
-- passing "ayuLastPromptedAt": null since it was written, doing nothing.
--
-- That matters now because changing Ayu's language should bring the next
-- check-in forward: the last nudge was in a language the patient has just
-- told us they do not want, so it should not still be holding the clock.
--
-- Fix is one field, using jsonb key PRESENCE rather than the value's
-- nullness — which is the contract the rest of this function already
-- documents ("a section key that is ABSENT is left untouched").
--
-- Re-publishes app_save_my_health_profile in full (body from
-- 20260915000000_patient_health_profile.sql) with only that line changed.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

create or replace function app_save_my_health_profile(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    v_profile jsonb := coalesce(p_payload->'profile', '{}'::jsonb);
    item jsonb;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients have a health profile';
    end if;

    insert into "PatientProfile" as pp ("user_id") values (me."id")
    on conflict ("user_id") do nothing;

    -- coalesce(new, existing) on every column: an omitted key means "leave
    -- it alone", so a section-at-a-time editor can send only what it owns.
    update "PatientProfile" pp set
        "blood_group"       = coalesce(nullif(v_profile->>'bloodGroup', ''), pp."blood_group"),
        "height_cm"         = coalesce((v_profile->>'heightCm')::numeric, pp."height_cm"),
        "weight_kg"         = coalesce((v_profile->>'weightKg')::numeric, pp."weight_kg"),
        "pregnancy_status"  = coalesce(nullif(v_profile->>'pregnancyStatus', ''), pp."pregnancy_status"),
        "pregnancy_due_date" = coalesce((v_profile->>'pregnancyDueDate')::date, pp."pregnancy_due_date"),
        "smoking"           = coalesce(nullif(v_profile->>'smoking', ''), pp."smoking"),
        "alcohol"           = coalesce(nullif(v_profile->>'alcohol', ''), pp."alcohol"),
        "betel"             = coalesce(nullif(v_profile->>'betel', ''), pp."betel"),
        "disabilities"      = coalesce(v_profile->>'disabilities', pp."disabilities"),
        "emergency_contact_name"  = coalesce(v_profile->>'emergencyContactName', pp."emergency_contact_name"),
        "emergency_contact_relationship" = coalesce(v_profile->>'emergencyContactRelationship', pp."emergency_contact_relationship"),
        "emergency_contact_phone" = coalesce(v_profile->>'emergencyContactPhone', pp."emergency_contact_phone"),
        "preferred_language" = coalesce(nullif(v_profile->>'preferredLanguage', ''), pp."preferred_language"),
        "insurance_provider" = coalesce(v_profile->>'insuranceProvider', pp."insurance_provider"),
        "insurance_number"   = coalesce(v_profile->>'insuranceNumber', pp."insurance_number"),
        "organ_donor"        = coalesce((v_profile->>'organDonor')::boolean, pp."organ_donor"),
        "regular_doctor_name" = coalesce(v_profile->>'regularDoctorName', pp."regular_doctor_name"),
        "allergies_status"    = coalesce(nullif(v_profile->>'allergiesStatus', ''), pp."allergies_status"),
        "conditions_status"   = coalesce(nullif(v_profile->>'conditionsStatus', ''), pp."conditions_status"),
        "medications_status"  = coalesce(nullif(v_profile->>'medicationsStatus', ''), pp."medications_status"),
        "surgeries_status"    = coalesce(nullif(v_profile->>'surgeriesStatus', ''), pp."surgeries_status"),
        "family_history_status" = coalesce(nullif(v_profile->>'familyHistoryStatus', ''), pp."family_history_status"),
        "immunisations_status" = coalesce(nullif(v_profile->>'immunisationsStatus', ''), pp."immunisations_status"),
        "implants_status"     = coalesce(nullif(v_profile->>'implantsStatus', ''), pp."implants_status"),
        "ayu_enabled"         = coalesce((v_profile->>'ayuEnabled')::boolean, pp."ayu_enabled"),
        -- Key ABSENT means "leave it alone"; key PRESENT but null means
        -- "clear it". coalesce() could not tell those apart, so a null was
        -- silently a no-op and the check-in clock could never be reset.
        "ayu_last_prompted_at" = case
            when v_profile ? 'ayuLastPromptedAt'
            then (v_profile->>'ayuLastPromptedAt')::timestamptz
            else pp."ayu_last_prompted_at" end,
        "profile_completed_at" = coalesce((v_profile->>'profileCompletedAt')::timestamptz, pp."profile_completed_at")
    where pp."user_id" = me."id";

    if p_payload ? 'allergies' then
        delete from "PatientAllergy" where "patient_id" = me."id" and "source" = 'PATIENT';
        for item in select * from jsonb_array_elements(p_payload->'allergies') loop
            if coalesce(trim(item->>'allergen'), '') <> '' then
                insert into "PatientAllergy" ("patient_id","allergen","kind","reaction","severity")
                values (me."id", trim(item->>'allergen'),
                        coalesce(nullif(item->>'kind',''), 'DRUG'),
                        nullif(item->>'reaction',''),
                        coalesce(nullif(item->>'severity',''), 'UNKNOWN'));
            end if;
        end loop;
    end if;

    if p_payload ? 'conditions' then
        delete from "PatientCondition" where "patient_id" = me."id" and "source" = 'PATIENT';
        for item in select * from jsonb_array_elements(p_payload->'conditions') loop
            if coalesce(trim(item->>'condition'), '') <> '' then
                insert into "PatientCondition" ("patient_id","condition","since","status","notes")
                values (me."id", trim(item->>'condition'),
                        (nullif(item->>'since',''))::date,
                        coalesce(nullif(item->>'status',''), 'ACTIVE'),
                        nullif(item->>'notes',''));
            end if;
        end loop;
    end if;

    if p_payload ? 'medications' then
        delete from "PatientMedication" where "patient_id" = me."id" and "source" = 'PATIENT';
        for item in select * from jsonb_array_elements(p_payload->'medications') loop
            if coalesce(trim(item->>'drugName'), '') <> '' then
                insert into "PatientMedication" ("patient_id","drug_name","dosage","frequency","since","ongoing","notes")
                values (me."id", trim(item->>'drugName'),
                        nullif(item->>'dosage',''), nullif(item->>'frequency',''),
                        (nullif(item->>'since',''))::date,
                        coalesce((item->>'ongoing')::boolean, true),
                        nullif(item->>'notes',''));
            end if;
        end loop;
    end if;

    if p_payload ? 'history' then
        delete from "PatientHistoryEvent" where "patient_id" = me."id" and "source" = 'PATIENT';
        for item in select * from jsonb_array_elements(p_payload->'history') loop
            if coalesce(trim(item->>'label'), '') <> '' and coalesce(item->>'kind','') <> '' then
                insert into "PatientHistoryEvent" ("patient_id","kind","label","occurred_year","relationship","notes")
                values (me."id", item->>'kind', trim(item->>'label'),
                        (nullif(item->>'occurredYear',''))::int,
                        nullif(item->>'relationship',''),
                        nullif(item->>'notes',''));
            end if;
        end loop;
    end if;

    return health_profile_json(me."id");
end $$;

revoke execute on function app_save_my_health_profile(jsonb) from public, anon;
