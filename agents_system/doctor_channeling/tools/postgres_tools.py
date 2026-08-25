"""Thin wrappers over the existing app_* Supabase RPCs, JWT-bound so
auth.uid() resolves correctly inside each RPC (RLS is deny-all;
these RPCs check auth.uid() + role='PATIENT' themselves)."""

from supabase import AsyncClient, acreate_client

import config


class RpcError(Exception):
    pass


async def build_client(jwt: str) -> AsyncClient:
    client = await acreate_client(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
    client.postgrest.auth(jwt)
    return client


async def _call(jwt: str, fn: str, args: dict) -> object:
    client = await build_client(jwt)
    try:
        response = await client.rpc(fn, args).execute()
        return response.data
    except Exception as exc:  # noqa: BLE001 - RPC errors surface as readable strings from Postgres
        raise RpcError(str(exc)) from exc


async def search_doctors(
    jwt: str,
    specialty: str | None = None,
    city: str | None = None,
    min_rating: float | None = None,
) -> list[dict]:
    data = await _call(
        jwt,
        "app_search_doctors",
        {"p_specialty": specialty, "p_city": city, "p_min_rating": min_rating},
    )
    return data or []


async def get_doctor_availability(jwt: str, doctor_id: str, lookahead_days: int = 14) -> list[dict]:
    data = await _call(
        jwt,
        "app_get_doctor_availability",
        {"p_doctor_id": doctor_id, "p_lookahead_days": lookahead_days},
    )
    return data or []


async def get_center_availability(jwt: str, channeling_center_id: str, lookahead_days: int = 14) -> list[dict]:
    data = await _call(
        jwt,
        "app_get_center_availability",
        {"p_channeling_center_id": channeling_center_id, "p_lookahead_days": lookahead_days},
    )
    return data or []


async def book_appointment(
    jwt: str, doctor_schedule_id: str, appointment_date: str, reason: str | None = None
) -> dict:
    data = await _call(
        jwt,
        "app_book_appointment",
        {
            "p_doctor_schedule_id": doctor_schedule_id,
            "p_appointment_date": appointment_date,
            "p_reason": reason,
        },
    )
    return data
