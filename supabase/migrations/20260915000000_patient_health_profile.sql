-- ==============================================
-- AyuLink - Patient health profile
--
-- Until now "User" held identity only (NIC, name, DOB, phone). A doctor
-- scanning a Medical ID saw who the patient was and what had been
-- prescribed before — nothing about allergies, chronic conditions, or
-- what they are already taking. This adds that background, owned and
-- maintained by the patient.
--
-- Three design decisions worth stating, because they shape every column
-- below:
--
-- 1. UNKNOWN is not the same as NONE.
--    "No known drug allergies" is a clinical statement. "Nobody has
--    asked" is the absence of one. Collapsing them into an empty list
--    would let a doctor read silence as reassurance, which is the exact
--    failure this data exists to prevent. Every list-shaped section
--    therefore carries its own *_status of UNKNOWN / NONE / LISTED.
--
-- 2. Patient-entered is not doctor-verified.
--    Every clinical row records `source` ('PATIENT' | 'DOCTOR') plus who
--    confirmed it and when. The same pattern "Treatment" already uses for
--    disease_name vs confirmed_diagnosis: the patient's own words are
--    kept, a clinician's confirmation is added alongside, never over it.
--
-- 3. Vocabularies are text + CHECK, not Postgres enums.
--    Clinical value sets grow (a severity band, a new lifestyle factor).
--    Adding a value to a CHECK is one statement; altering an enum type
--    that a dozen functions already reference is not. "Role" and
--    "AppointmentStatus" stay enums because they are closed sets that
--    define the app's own structure — these are not.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

-- ---------------------------------------------------------------- core
create table if not exists "PatientProfile" (
    "user_id"                 uuid primary key,
    -- Tier 1 vitals / flags
    "blood_group"             text,
    "height_cm"               numeric(5,1),
    "weight_kg"               numeric(5,1),
    "pregnancy_status"        text not null default 'NOT_APPLICABLE',
    "pregnancy_due_date"      date,
    -- Tier 2 lifestyle. Betel/areca is listed explicitly rather than
    -- lumped into "other": it is a leading oral-cancer risk factor in
    -- Sri Lanka and a doctor here will actually ask.
    "smoking"                 text not null default 'UNKNOWN',
    "alcohol"                 text not null default 'UNKNOWN',
    "betel"                   text not null default 'UNKNOWN',
    "disabilities"            text,
    -- Tier 3 admin
    "emergency_contact_name"  text,
    "emergency_contact_relationship" text,
    "emergency_contact_phone" text,
    "preferred_language"      text not null default 'EN',
    "insurance_provider"      text,
    "insurance_number"        text,
    "organ_donor"             boolean,
    "regular_doctor_name"     text,
    -- Per-section "has this actually been asked?" state — see note 1.
    "allergies_status"        text not null default 'UNKNOWN',
    "conditions_status"       text not null default 'UNKNOWN',
    "medications_status"      text not null default 'UNKNOWN',
    "surgeries_status"        text not null default 'UNKNOWN',
    "family_history_status"   text not null default 'UNKNOWN',
    "immunisations_status"    text not null default 'UNKNOWN',
    "implants_status"         text not null default 'UNKNOWN',
    -- Ayu (the health-profile assistant) bookkeeping
    "ayu_enabled"             boolean not null default true,
    "ayu_last_prompted_at"    timestamptz,
    "profile_completed_at"    timestamptz,
    "created_at"              timestamptz not null default now(),
    "updated_at"              timestamptz not null default now(),
    constraint "PatientProfile_user_id_fkey"
        foreign key ("user_id") references "User" ("id") on delete cascade,
    constraint "PatientProfile_blood_group_check" check (
        "blood_group" is null or "blood_group" in
        ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    constraint "PatientProfile_pregnancy_check" check ("pregnancy_status" in
        ('NOT_APPLICABLE','NOT_PREGNANT','PREGNANT','BREASTFEEDING','UNKNOWN')),
    constraint "PatientProfile_smoking_check" check ("smoking" in
        ('UNKNOWN','NEVER','FORMER','CURRENT')),
    constraint "PatientProfile_alcohol_check" check ("alcohol" in
        ('UNKNOWN','NEVER','OCCASIONAL','REGULAR')),
    constraint "PatientProfile_betel_check" check ("betel" in
        ('UNKNOWN','NEVER','OCCASIONAL','REGULAR')),
    constraint "PatientProfile_language_check" check ("preferred_language" in ('EN','SI','TA')),
    constraint "PatientProfile_height_check" check ("height_cm" is null or ("height_cm" > 0 and "height_cm" <= 275)),
    constraint "PatientProfile_weight_check" check ("weight_kg" is null or ("weight_kg" > 0 and "weight_kg" <= 500)),
    constraint "PatientProfile_allergies_status_check"    check ("allergies_status"    in ('UNKNOWN','NONE','LISTED')),
    constraint "PatientProfile_conditions_status_check"   check ("conditions_status"   in ('UNKNOWN','NONE','LISTED')),
    constraint "PatientProfile_medications_status_check"  check ("medications_status"  in ('UNKNOWN','NONE','LISTED')),
    constraint "PatientProfile_surgeries_status_check"    check ("surgeries_status"    in ('UNKNOWN','NONE','LISTED')),
    constraint "PatientProfile_family_status_check"       check ("family_history_status" in ('UNKNOWN','NONE','LISTED')),
    constraint "PatientProfile_immunisations_status_check" check ("immunisations_status" in ('UNKNOWN','NONE','LISTED')),
    constraint "PatientProfile_implants_status_check"     check ("implants_status"     in ('UNKNOWN','NONE','LISTED'))
);

drop trigger if exists "PatientProfile_updated_at" on "PatientProfile";
create trigger "PatientProfile_updated_at"
    before update on "PatientProfile"
    for each row execute function set_updated_at_snake();


-- ----------------------------------------------------------- allergies
create table if not exists "PatientAllergy" (
    "id"           uuid primary key default gen_random_uuid(),
    "patient_id"   uuid not null,
    "allergen"     text not null,
    "kind"         text not null default 'DRUG',
    "reaction"     text,
    "severity"     text not null default 'UNKNOWN',
    "source"       text not null default 'PATIENT',
    "confirmed_by" uuid,
    "confirmed_at" timestamptz,
    "created_at"   timestamptz not null default now(),
    constraint "PatientAllergy_patient_fkey" foreign key ("patient_id") references "User" ("id") on delete cascade,
    constraint "PatientAllergy_confirmed_by_fkey" foreign key ("confirmed_by") references "User" ("id"),
    constraint "PatientAllergy_kind_check" check ("kind" in ('DRUG','FOOD','ENVIRONMENTAL','OTHER')),
    constraint "PatientAllergy_severity_check" check ("severity" in ('UNKNOWN','MILD','MODERATE','SEVERE','ANAPHYLAXIS')),
    constraint "PatientAllergy_source_check" check ("source" in ('PATIENT','DOCTOR'))
);
create index if not exists "PatientAllergy_patient_idx" on "PatientAllergy" ("patient_id");


-- ---------------------------------------------------------- conditions
create table if not exists "PatientCondition" (
    "id"           uuid primary key default gen_random_uuid(),
    "patient_id"   uuid not null,
    "condition"    text not null,
    "since"        date,
    "status"       text not null default 'ACTIVE',
    "notes"        text,
    "source"       text not null default 'PATIENT',
    "confirmed_by" uuid,
    "confirmed_at" timestamptz,
    "created_at"   timestamptz not null default now(),
    constraint "PatientCondition_patient_fkey" foreign key ("patient_id") references "User" ("id") on delete cascade,
    constraint "PatientCondition_confirmed_by_fkey" foreign key ("confirmed_by") references "User" ("id"),
    constraint "PatientCondition_status_check" check ("status" in ('ACTIVE','RESOLVED')),
    constraint "PatientCondition_source_check" check ("source" in ('PATIENT','DOCTOR'))
);
create index if not exists "PatientCondition_patient_idx" on "PatientCondition" ("patient_id");


-- --------------------------------------------------------- medications
-- Long-term medication the patient is on, as THEY report it. Distinct
-- from "PrescriptionItem", which is what a doctor in this system issued:
-- most people's regular tablets predate the app entirely.
create table if not exists "PatientMedication" (
    "id"          uuid primary key default gen_random_uuid(),
    "patient_id"  uuid not null,
    "drug_name"   text not null,
    "dosage"      text,
    "frequency"   text,
    "since"       date,
    "ongoing"     boolean not null default true,
    "notes"       text,
    "source"      text not null default 'PATIENT',
    "created_at"  timestamptz not null default now(),
    constraint "PatientMedication_patient_fkey" foreign key ("patient_id") references "User" ("id") on delete cascade,
    constraint "PatientMedication_source_check" check ("source" in ('PATIENT','DOCTOR'))
);
create index if not exists "PatientMedication_patient_idx" on "PatientMedication" ("patient_id");


-- ------------------------------------------------------- history events
-- Surgeries, hospitalisations, immunisations, family history and
-- implants share one table: they are all "a labelled thing that happened
-- (or is present), optionally with a year and a note". Five near-identical
-- tables would buy nothing but five sets of RPCs to keep in sync.
create table if not exists "PatientHistoryEvent" (
    "id"            uuid primary key default gen_random_uuid(),
    "patient_id"    uuid not null,
    "kind"          text not null,
    "label"         text not null,
    "occurred_year" int,
    -- For FAMILY_HISTORY: whose ("Mother", "Father", "Sibling").
    "relationship"  text,
    "notes"         text,
    "source"        text not null default 'PATIENT',
    "created_at"    timestamptz not null default now(),
    constraint "PatientHistoryEvent_patient_fkey" foreign key ("patient_id") references "User" ("id") on delete cascade,
    constraint "PatientHistoryEvent_kind_check" check ("kind" in
        ('SURGERY','HOSPITALISATION','IMMUNISATION','FAMILY_HISTORY','IMPLANT')),
    constraint "PatientHistoryEvent_year_check" check
        ("occurred_year" is null or ("occurred_year" between 1900 and 2200)),
    constraint "PatientHistoryEvent_source_check" check ("source" in ('PATIENT','DOCTOR'))
);
create index if not exists "PatientHistoryEvent_patient_idx" on "PatientHistoryEvent" ("patient_id", "kind");


-- Deny-all RLS, same as every other table: the app_* functions below are
-- the only access path.
alter table "PatientProfile"      enable row level security;
alter table "PatientAllergy"      enable row level security;
alter table "PatientCondition"    enable row level security;
alter table "PatientMedication"   enable row level security;
alter table "PatientHistoryEvent" enable row level security;


-- ==============================================
-- Serialisation
-- ==============================================

create or replace function health_profile_json(p_patient_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'patientId', p_patient_id,
        'profile', coalesce(
            (select to_jsonb(pp) from "PatientProfile" pp where pp."user_id" = p_patient_id),
            '{}'::jsonb
        ),
        'allergies', coalesce((
            select jsonb_agg(to_jsonb(a) order by
                -- Most dangerous first: this list is read at a glance.
                case a."severity" when 'ANAPHYLAXIS' then 0 when 'SEVERE' then 1
                                  when 'MODERATE' then 2 when 'MILD' then 3 else 4 end,
                a."allergen")
            from "PatientAllergy" a where a."patient_id" = p_patient_id
        ), '[]'::jsonb),
        'conditions', coalesce((
            select jsonb_agg(to_jsonb(c) order by
                case c."status" when 'ACTIVE' then 0 else 1 end, c."condition")
            from "PatientCondition" c where c."patient_id" = p_patient_id
        ), '[]'::jsonb),
        'medications', coalesce((
            select jsonb_agg(to_jsonb(m) order by m."ongoing" desc, m."drug_name")
            from "PatientMedication" m where m."patient_id" = p_patient_id
        ), '[]'::jsonb),
        'history', coalesce((
            select jsonb_agg(to_jsonb(h) order by h."kind", h."occurred_year" desc nulls last, h."label")
            from "PatientHistoryEvent" h where h."patient_id" = p_patient_id
        ), '[]'::jsonb)
    );
$$;


-- ==============================================
-- Patient-facing RPCs
-- ==============================================

create or replace function app_get_my_health_profile()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients have a health profile';
    end if;
    return health_profile_json(me."id");
end $$;


-- Save the whole health profile in one atomic call.
--
-- Whole-object replace rather than per-section endpoints: both editors
-- that write this (the patient's own form, and Ayu at the end of its
-- interview) hold the complete picture and save once. Partial upserts
-- would need a delete-detection protocol on the client for no benefit,
-- and would let a half-applied save leave the allergy list disagreeing
-- with allergies_status.
--
-- A section key that is ABSENT from the payload is left untouched; a
-- section present as an empty array with status NONE is an explicit
-- "no known ..." — see note 1 at the top of this file.
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
        "ayu_last_prompted_at" = coalesce((v_profile->>'ayuLastPromptedAt')::timestamptz, pp."ayu_last_prompted_at"),
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


-- ==============================================
-- Clinician-facing read
-- ==============================================

-- What a doctor sees behind the "Clinical History" button after scanning
-- a Medical ID.
--
-- A PHARMACIST gets a deliberately narrowed view: allergies and current
-- medications only. That is everything needed to catch a dangerous
-- dispense, and nothing more — a pharmacy has no reason to read someone's
-- family history or past surgeries to hand over tablets.
create or replace function app_get_patient_health_profile(p_patient_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    full_profile jsonb;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" not in ('DOCTOR', 'PHARMACIST') then
        raise exception 'Only doctors and pharmacies can view a patient health profile';
    end if;
    if not exists (select 1 from "User" where "id" = p_patient_id and "role" = 'PATIENT') then
        raise exception 'Patient not found';
    end if;

    full_profile := health_profile_json(p_patient_id);

    if me."role" = 'PHARMACIST' then
        return jsonb_build_object(
            'patientId', p_patient_id,
            'scope', 'DISPENSING',
            'allergies', full_profile->'allergies',
            'medications', full_profile->'medications',
            'profile', jsonb_build_object(
                'allergies_status', full_profile->'profile'->'allergies_status',
                'medications_status', full_profile->'profile'->'medications_status'
            )
        );
    end if;

    return full_profile || jsonb_build_object('scope', 'FULL');
end $$;


-- ==============================================
-- Account details (all roles) + prescription export
-- ==============================================

-- The editable half of what registration collected. NIC, medicalId and
-- role are deliberately NOT here: NIC is the identity the Medical ID is
-- derived from, and letting it drift would silently break every QR
-- already printed or saved.
create or replace function app_update_my_account(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;

    if p_payload ? 'mobileNumber'
       and trim(p_payload->>'mobileNumber') !~ '^\+?[0-9]{9,15}$' then
        raise exception 'Invalid mobile number';
    end if;
    if p_payload ? 'dob' and (p_payload->>'dob')::timestamptz >= now() then
        raise exception 'Date of birth must be in the past';
    end if;

    update "User" set
        "firstName"    = coalesce(nullif(trim(p_payload->>'firstName'), ''), "firstName"),
        "lastName"     = coalesce(nullif(trim(p_payload->>'lastName'), ''), "lastName"),
        "mobileNumber" = coalesce(nullif(trim(p_payload->>'mobileNumber'), ''), "mobileNumber"),
        "dob"          = coalesce((p_payload->>'dob')::timestamptz, "dob")
    where "id" = me."id";

    -- Role-specific detail, each guarded by the caller's own role.
    if me."role" = 'PHARMACIST' and p_payload ? 'pharmacyName' then
        update "PharmacyProfile" set "pharmacyName" = coalesce(nullif(trim(p_payload->>'pharmacyName'), ''), "pharmacyName")
        where "userId" = me."id";
    end if;
    if me."role" = 'CHANNELING_CENTER' then
        update "ChannelingCenter" set
            "name"           = coalesce(nullif(trim(p_payload->>'centerName'), ''), "name"),
            "address"        = coalesce(nullif(trim(p_payload->>'centerAddress'), ''), "address"),
            "contact_number" = coalesce(nullif(trim(p_payload->>'centerContactNumber'), ''), "contact_number"),
            "city"           = coalesce(nullif(trim(p_payload->>'centerCity'), ''), "city")
        where "user_id" = me."id";
    end if;

    return app_get_my_profile();
end $$;


-- Flat, one-row-per-medication export of the caller's own prescription
-- history — the data behind "Download as CSV". Returned as rows rather
-- than a CSV string so the client owns escaping and the file name, and
-- so the same RPC can back an on-screen table later.
create or replace function app_export_my_prescriptions()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients can export their prescription history';
    end if;

    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'prescriptionId', p."id",
            'dateIssued',     p."dateIssued",
            'diagnosis',      p."diagnosis",
            'status',         case when p."expires_at" is not null and now() > p."expires_at"
                                   then 'EXPIRED' else p."status"::text end,
            'expiresAt',      p."expires_at",
            'doctorName',     'Dr. ' || du."firstName" || ' ' || du."lastName",
            'doctorSlmc',     dp."slmc_id",
            'specialty',      dp."specialty",
            'drugName',       i."drugName",
            'dosage',         i."dosage",
            'frequency',      i."frequency",
            'duration',       i."duration",
            'route',          i."route",
            'instructions',   i."instructions",
            'dispensed',      i."dispensed",
            'dispensedAt',    i."dispensedAt",
            'pharmacyName',   (select coalesce(php."pharmacyName", phu."firstName" || ' ' || phu."lastName")
                               from "User" phu
                               left join "PharmacyProfile" php on php."userId" = phu."id"
                               where phu."id" = i."dispensedById")
        ) order by p."dateIssued" desc, i."drugName")
        from "Prescription" p
        join "PrescriptionItem" i on i."prescriptionId" = p."id"
        join "User" du on du."id" = p."doctorId"
        left join "DoctorProfile" dp on dp."user_id" = p."doctorId"
        where p."patientId" = me."id"
    ), '[]'::jsonb);
end $$;


revoke execute on function health_profile_json(uuid) from public, anon;
revoke execute on function app_get_my_health_profile() from public, anon;
revoke execute on function app_save_my_health_profile(jsonb) from public, anon;
revoke execute on function app_get_patient_health_profile(uuid) from public, anon;
revoke execute on function app_update_my_account(jsonb) from public, anon;
revoke execute on function app_export_my_prescriptions() from public, anon;
