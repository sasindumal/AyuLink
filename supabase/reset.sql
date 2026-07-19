-- ==============================================
-- AyuLink - Database Reset
-- Removes EVERYTHING AyuLink created so the init
-- migration can be re-run from scratch.
--
-- ⚠️ Destroys all AyuLink data AND all app logins.
-- Paste into the Supabase SQL Editor and run, then
-- run supabase/migrations/20260719000000_init.sql.
-- ==============================================

-- Tables (cascade also drops dependent functions/triggers,
-- e.g. prescription_json which takes a "Prescription" row)
drop table if exists "PrescriptionItem" cascade;
drop table if exists "Prescription" cascade;
drop table if exists "DoctorProfile" cascade;
drop table if exists "PharmacyProfile" cascade;
drop table if exists "MobileOtp" cascade;
drop table if exists "User" cascade;

-- Functions (current and older signatures)
drop function if exists app_login_email_for_license(text);
drop function if exists app_get_pharmacy_profile();
drop function if exists app_dispense_item(uuid, uuid, boolean);
drop function if exists app_create_prescription(uuid, text, jsonb);
drop function if exists app_lookup_patient(text);
drop function if exists app_list_prescriptions();
drop function if exists app_register_profile(jsonb);
drop function if exists app_get_my_profile();
drop function if exists create_user_with_profile(uuid, jsonb, jsonb, jsonb);
drop function if exists create_user_with_profile(jsonb, jsonb, jsonb);
drop function if exists create_prescription_with_items(uuid, uuid, text, jsonb);
drop function if exists create_prescription_with_items(text, text, text, jsonb);
drop function if exists dispense_prescription_item(uuid, uuid, boolean, uuid);
drop function if exists dispense_prescription_item(text, text, boolean, text);
drop function if exists set_updated_at();

-- Enums
drop type if exists "PrescriptionStatus";
drop type if exists "Role";

-- Auth accounts (⚠️ removes every login for this project)
delete from auth.users;
