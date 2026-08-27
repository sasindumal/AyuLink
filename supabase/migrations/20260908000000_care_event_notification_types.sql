-- ==============================================
-- AyuLink - Care-journey NotificationType labels
--
-- Split from 20260908010000_care_journey_events.sql for the same
-- reason as the PRESCRIBED split: Postgres forbids *using* a newly
-- added enum label in the transaction that adds it, and each
-- migration file runs as one transaction.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

alter type "NotificationType" add value if not exists 'APPOINTMENT_STARTED';
alter type "NotificationType" add value if not exists 'PRESCRIPTION_ISSUED';
alter type "NotificationType" add value if not exists 'PRESCRIPTION_DISPENSED';
alter type "NotificationType" add value if not exists 'TREATMENT_FOLLOWUP';
