-- ==============================================
-- AyuLink - "no language chosen yet" must be representable
--
-- PatientProfile.preferred_language was `text not null default 'EN'`.
-- Ayu asks which language to use only when it doesn't already know —
-- but with that default, a profile row that has never answered the
-- question is indistinguishable from one that deliberately chose
-- English. The result: the language picker never appeared for anyone
-- whose profile row existed, and Ayu opened in English regardless of
-- what the patient wanted.
--
-- Same distinction the *_status columns already make between UNKNOWN and
-- NONE, applied to language: NULL now means "never asked", and only an
-- actual choice writes a value.
--
-- Existing rows that never completed an Ayu run are reset to NULL so
-- they get the question; rows that completed one keep their choice.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

alter table "PatientProfile" alter column "preferred_language" drop default;
alter table "PatientProfile" alter column "preferred_language" drop not null;

update "PatientProfile"
   set "preferred_language" = null
 where "profile_completed_at" is null;

comment on column "PatientProfile"."preferred_language" is
    'EN | SI | TA. NULL means the patient has never been asked — Ayu shows the language picker in that case.';
