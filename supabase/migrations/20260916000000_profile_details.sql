-- ==============================================
-- AyuLink - app_get_my_profile returns the details a profile screen needs
--
-- The function returned identity only: id, NIC, name, role, medicalId,
-- verified. Every app now has a profile screen showing what registration
-- collected and letting the editable parts be changed
-- (app_update_my_account), and none of it could be displayed — mobile
-- number and date of birth were simply not in the payload, and neither
-- was the role-specific half (pharmacy name and license, centre address
-- and city, SLMC number and specialties).
--
-- Adds those, keeping every existing key exactly as it was so nothing
-- currently reading this payload has to change.
--
-- Run via `supabase db push` or paste into the SQL Editor.
-- ==============================================

create or replace function app_get_my_profile()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    extra jsonb := '{}'::jsonb;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Your profile was not found. Please register first';
    end if;

    if me."role" = 'DOCTOR' then
        extra := jsonb_build_object('doctorProfile', (
            select jsonb_build_object(
                'slmcRegNo', dp."slmc_id",
                'specialization', dp."specialty",
                'rating', dp."rating",
                'specialties', coalesce((
                    select jsonb_agg(s."name" order by s."name")
                    from "DoctorSpecialty" ds
                    join "Specialty" s on s."id" = ds."specialty_id"
                    where ds."doctor_id" = me."id"
                ), '[]'::jsonb)
            )
            from "DoctorProfile" dp where dp."user_id" = me."id"
        ));
    elsif me."role" = 'PHARMACIST' then
        extra := jsonb_build_object('pharmacyProfile', (
            select jsonb_build_object(
                'pharmacyName', pp."pharmacyName",
                'licenseNumber', pp."licenseNumber"
            )
            from "PharmacyProfile" pp where pp."userId" = me."id"
        ));
    elsif me."role" = 'CHANNELING_CENTER' then
        extra := jsonb_build_object('channelingCenter', (
            select jsonb_build_object(
                'id', cc."id",
                'name', cc."name",
                'address', cc."address",
                'city', cc."city",
                'contactNumber', cc."contact_number"
            )
            from "ChannelingCenter" cc where cc."user_id" = me."id"
        ));
    end if;

    return jsonb_build_object(
        'id', me."id",
        'nicNumber', me."nicNumber",
        'firstName', me."firstName",
        'lastName', me."lastName",
        'mobileNumber', me."mobileNumber",
        'dob', me."dob",
        'role', me."role",
        'medicalId', me."medicalId",
        'verified', me."verified",
        'memberSince', me."createdAt"
    ) || extra;
end $$;

revoke execute on function app_get_my_profile() from public, anon;
