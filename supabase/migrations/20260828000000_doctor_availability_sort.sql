-- ==============================================
-- AyuLink - app_get_doctor_availability: search + sort
-- Adds optional p_near_lat/p_near_lng (for a distanceKm
-- field and "nearest" sort) and p_sort ('soonest' |
-- 'center' | 'nearest') to the per-doctor availability
-- list opened from Quick Search's "See other times with
-- this doctor" and from By Doctor's detail view.
-- ==============================================

drop function if exists app_get_doctor_availability(uuid, int);

create or replace function app_get_doctor_availability(
    p_doctor_id      uuid,
    p_lookahead_days int default 14,
    p_near_lat       float8 default null,
    p_near_lng       float8 default null,
    p_sort           text default 'soonest'
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    me "User";
    result jsonb;
begin
    select * into me from "User" where "id" = auth.uid();
    if me is null then
        raise exception 'Not signed in';
    end if;
    if me."role" <> 'PATIENT' then
        raise exception 'Only patients can view doctor availability';
    end if;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'doctorScheduleId', ds."id",
            'channelingCenterId', cc."id",
            'channelingCenterName', cc."name",
            'address', cc."address",
            'city', cc."city",
            'contactNumber', cc."contact_number",
            'date', c.slot_date,
            'startTime', ds."start_time",
            'endTime', ds."end_time",
            'distanceKm', case when p_near_lat is null or p_near_lng is null then null
                else (cc."location" <-> point(p_near_lng, p_near_lat)) * 111.32 end
        )
        order by
            case when p_sort = 'center' then cc."name" end asc,
            case when p_sort = 'nearest' and p_near_lat is not null and p_near_lng is not null
                then (cc."location" <-> point(p_near_lng, p_near_lat)) end asc,
            c.slot_date asc, ds."start_time" asc
    ), '[]'::jsonb)
    into result
    from "DoctorSchedule" ds
    join "ChannelingCenter" cc on cc."id" = ds."channeling_center_id"
    cross join lateral (
        select d.day::date as slot_date
        from generate_series(
            current_date, current_date + (p_lookahead_days || ' days')::interval, interval '1 day'
        ) as d(day)
        where (
            case ds."day_of_week"
                when 'MONDAY' then 1 when 'TUESDAY' then 2 when 'WEDNESDAY' then 3
                when 'THURSDAY' then 4 when 'FRIDAY' then 5 when 'SATURDAY' then 6
                when 'SUNDAY' then 7
            end = extract(isodow from d.day)::int
        )
        and (d.day::date > current_date or ds."start_time" > current_time)
    ) as c
    where ds."doctor_id" = p_doctor_id
      and not exists (
          select 1 from "Appointment" a
          where a."doctor_id" = ds."doctor_id"
            and a."channeling_center_id" = ds."channeling_center_id"
            and a."appointment_date" = c.slot_date
            and a."start_time" = ds."start_time"
            and a."status" <> 'CANCELLED'
      );

    return result;
end $$;

revoke execute on function app_get_doctor_availability(uuid, int, float8, float8, text) from public, anon;
