-- ==============================================
-- AyuLink - Per-doctor ratings on diagnosis completion
--
-- A diagnosis can involve more than one doctor over its life (the
-- initial GP visit, then possibly a referred specialist) — but
-- "Treatment".appointment_id is a single pointer that gets
-- overwritten every time app_link_treatment_appointment runs, so
-- there was previously no reliable way to list everyone a patient
-- was actually seen by for one diagnosis. Adding "Appointment".
-- treatment_id makes that a proper one-to-many history instead;
-- Treatment.appointment_id remains the "current" pointer used
-- elsewhere (treatment_json's summary, etc.) and is untouched.
--
-- "DoctorRating" then lets the patient rate each of those doctors
-- individually when they mark a diagnosis complete. A trigger keeps
-- DoctorProfile.rating as the live average — recomputed from every
-- rating that doctor has ever received, not a hand-maintained
-- running total, so it can never drift out of sync.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

-- ----- Schema -----

alter table "Appointment" add column if not exists "treatment_id" uuid null;

do $$ begin
    alter table "Appointment" add constraint "Appointment_treatment_id_fkey"
        foreign key ("treatment_id") references "Treatment" ("id");
exception when duplicate_object then null;
end $$;

create index if not exists "Appointment_treatment_id_idx" on "Appointment" ("treatment_id");

-- Backfill from the existing single pointer so no history already on
-- file is lost by switching to the one-to-many column.
update "Appointment" a set "treatment_id" = t."id"
from "Treatment" t
where t."appointment_id" = a."id" and a."treatment_id" is null;

create table "DoctorRating" (
    "id"             uuid primary key default gen_random_uuid(),
    "treatment_id"   uuid not null,
    "doctor_id"      uuid not null,
    "patient_id"     uuid not null,
    "appointment_id" uuid null,
    "rating"         smallint not null check ("rating" between 1 and 5),
    "feedback"       text null,
    "created_at"     timestamptz not null default now(),

    constraint "DoctorRating_treatment_id_fkey" foreign key ("treatment_id") references "Treatment" ("id"),
    constraint "DoctorRating_doctor_id_fkey" foreign key ("doctor_id") references "User" ("id"),
    constraint "DoctorRating_patient_id_fkey" foreign key ("patient_id") references "User" ("id"),
    constraint "DoctorRating_appointment_id_fkey" foreign key ("appointment_id") references "Appointment" ("id"),
    -- One rating per doctor per diagnosis journey; app_rate_doctor
    -- upserts on this so a resumed/replayed rating flow can never
    -- duplicate or error instead of just updating.
    constraint "DoctorRating_unique" unique ("treatment_id", "doctor_id")
);

create index "DoctorRating_doctor_id_idx" on "DoctorRating" ("doctor_id");

-- ==============================================
-- Internal functions
-- ==============================================

-- Recomputes one doctor's DoctorProfile.rating as the live average of
-- every "DoctorRating" row they have — never a hand-maintained running
-- total, so it can't drift. Rounded to 2 decimal places for display.
create or replace function recompute_doctor_rating(p_doctor_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
    update "DoctorProfile" set "rating" = (
        select round(avg("rating")::numeric, 2) from "DoctorRating" where "doctor_id" = p_doctor_id
    )
    where "user_id" = p_doctor_id;
end $$;

create or replace function on_doctor_rating_changed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
    perform recompute_doctor_rating(coalesce(NEW."doctor_id", OLD."doctor_id"));
    return coalesce(NEW, OLD);
end $$;

drop trigger if exists "DoctorRating_recompute" on "DoctorRating";
create trigger "DoctorRating_recompute"
    after insert or update or delete on "DoctorRating"
    for each row execute function on_doctor_rating_changed();

-- ==============================================
-- App functions
-- ==============================================

-- Re-published: also records the one-to-many history column, so a
-- diagnosis that later gets a follow-up appointment with a different
-- (or the same) doctor keeps every visit on file, not just the latest.
create or replace function app_link_treatment_appointment(
    p_treatment_id   uuid,
    p_appointment_id uuid
) returns jsonb
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
    if not exists (select 1 from "Appointment" where "id" = p_appointment_id and "patient_id" = me."id") then
        raise exception 'Appointment not found';
    end if;

    update "Appointment" set "treatment_id" = p_treatment_id where "id" = p_appointment_id;

    update "Treatment" set "appointment_id" = p_appointment_id, "status" = 'BOOKED'
    where "id" = p_treatment_id
    returning * into t;

    return treatment_json(t);
end $$;

-- Every doctor the patient was actually seen by for one diagnosis —
-- every Appointment linked to this treatment_id where the doctor
-- genuinely started the visit (doctor_started_at is set), not just
-- booked-and-never-attended — that they haven't already rated for
-- this treatment. Used to drive the end-of-course rating loop; the
-- "not already rated" filter is what makes that loop safe to resume
-- or replay without asking about the same doctor twice.
create or replace function app_treatment_doctors_to_rate(p_treatment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    result jsonb;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if not exists (select 1 from "Treatment" where "id" = p_treatment_id and "patient_id" = me."id") then
        raise exception 'Diagnosis not found';
    end if;

    select coalesce(jsonb_agg(row_json order by started_at), '[]'::jsonb)
    into result
    from (
        select distinct on (a."doctor_id")
            a."doctor_started_at" as started_at,
            jsonb_build_object(
                'doctorId', a."doctor_id",
                'appointmentId', a."id",
                'firstName', u."firstName",
                'lastName', u."lastName",
                'specialty', dp."specialty"
            ) as row_json
        from "Appointment" a
        join "User" u on u."id" = a."doctor_id"
        left join "DoctorProfile" dp on dp."user_id" = a."doctor_id"
        where a."treatment_id" = p_treatment_id
          and a."doctor_started_at" is not null
          and not exists (
              select 1 from "DoctorRating" dr
              where dr."treatment_id" = p_treatment_id and dr."doctor_id" = a."doctor_id"
          )
        order by a."doctor_id", a."doctor_started_at" desc
    ) s;

    return result;
end $$;

-- Records (or updates) the patient's rating of one doctor for one
-- diagnosis. Rejects a doctor who was never actually part of this
-- treatment's journey, so a stray/forged call can't pollute a
-- doctor's average with an unrelated rating.
create or replace function app_rate_doctor(
    p_treatment_id uuid,
    p_doctor_id    uuid,
    p_rating       int,
    p_feedback     text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    me "User";
    v_appointment_id uuid;
    v_row "DoctorRating";
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if not exists (select 1 from "Treatment" where "id" = p_treatment_id and "patient_id" = me."id") then
        raise exception 'Diagnosis not found';
    end if;
    if p_rating is null or p_rating < 1 or p_rating > 5 then
        raise exception 'Rating must be between 1 and 5';
    end if;

    select "id" into v_appointment_id from "Appointment"
    where "treatment_id" = p_treatment_id and "doctor_id" = p_doctor_id
    order by "doctor_started_at" desc nulls last
    limit 1;

    if v_appointment_id is null then
        raise exception 'This doctor was not part of this diagnosis';
    end if;

    insert into "DoctorRating" ("treatment_id", "doctor_id", "patient_id", "appointment_id", "rating", "feedback")
    values (p_treatment_id, p_doctor_id, me."id", v_appointment_id, p_rating, nullif(trim(coalesce(p_feedback, '')), ''))
    on conflict ("treatment_id", "doctor_id") do update
        set "rating" = excluded."rating", "feedback" = excluded."feedback", "created_at" = now()
    returning * into v_row;

    return to_jsonb(v_row);
end $$;

-- ----- Function grants -----

revoke execute on function recompute_doctor_rating(uuid) from public, anon, authenticated;
revoke execute on function on_doctor_rating_changed() from public, anon, authenticated;

revoke execute on function app_link_treatment_appointment(uuid, uuid) from public, anon;
revoke execute on function app_treatment_doctors_to_rate(uuid) from public, anon;
revoke execute on function app_rate_doctor(uuid, uuid, int, text) from public, anon;

-- ----- Row Level Security -----

alter table "DoctorRating" enable row level security;
