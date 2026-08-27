-- ==============================================
-- AyuLink - Add PRESCRIBED to TreatmentStatus
--
-- Split out from 20260907010000_appointment_prescriptions.sql on
-- purpose: Postgres forbids *using* a newly added enum value in the
-- same transaction that adds it, and every migration file here runs
-- as one transaction. This file only adds the label; the migration
-- right after it is what actually references 'PRESCRIBED'.
--
-- Placed BEFORE 'COMPLETED' so the enum's own sort order still
-- matches the real care lifecycle:
--   DIAGNOSED -> BOOKED -> PRESCRIBED -> COMPLETED
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

alter type "TreatmentStatus" add value if not exists 'PRESCRIBED' before 'COMPLETED';
