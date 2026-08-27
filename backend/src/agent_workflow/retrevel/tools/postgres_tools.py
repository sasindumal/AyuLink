"""Thin wrappers over the existing app_* Supabase RPCs, JWT-bound so
auth.uid() resolves correctly inside each RPC (RLS is deny-all;
these RPCs check auth.uid() + role='PATIENT' themselves)."""

from supabase import AsyncClient, acreate_client

from utils import config


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


async def create_treatment(
    jwt: str,
    thread_id: str,
    disease_name: str,
    specialty: str | None = None,
    description: str | None = None,
) -> dict:
    data = await _call(
        jwt,
        "app_create_treatment",
        {
            "p_thread_id": thread_id,
            "p_disease_name": disease_name,
            "p_specialty": specialty,
            "p_description": description,
        },
    )
    return data


async def link_treatment_appointment(jwt: str, treatment_id: str, appointment_id: str) -> dict:
    data = await _call(
        jwt,
        "app_link_treatment_appointment",
        {"p_treatment_id": treatment_id, "p_appointment_id": appointment_id},
    )
    return data


async def unlink_treatment_appointment(jwt: str, treatment_id: str) -> dict:
    data = await _call(jwt, "app_unlink_treatment_appointment", {"p_treatment_id": treatment_id})
    return data


async def cancel_appointment(jwt: str, appointment_id: str, reason: str | None = None) -> dict:
    data = await _call(
        jwt,
        "app_cancel_appointment",
        {"p_appointment_id": appointment_id, "p_reason": reason},
    )
    return data


async def reschedule_appointment(
    jwt: str, appointment_id: str, new_doctor_schedule_id: str, new_date: str
) -> dict:
    data = await _call(
        jwt,
        "app_reschedule_appointment",
        {
            "p_appointment_id": appointment_id,
            "p_new_doctor_schedule_id": new_doctor_schedule_id,
            "p_new_date": new_date,
        },
    )
    return data


# ----- Care journey (visit -> prescription -> dispensing -> follow-up) -----


async def treatment_by_thread(jwt: str, thread_id: str) -> dict | None:
    """The caller's diagnosis for one chat thread, or None if this thread
    never produced one (e.g. a general-questions conversation)."""
    data = await _call(jwt, "app_treatment_by_thread", {"p_thread_id": thread_id})
    return data or None


async def treatment_timeline(jwt: str, treatment_id: str) -> dict:
    """Everything that has happened on one diagnosis since it was booked,
    as stably-keyed events — see app_treatment_timeline. The keys are what
    make replaying these into the chat idempotent."""
    data = await _call(jwt, "app_treatment_timeline", {"p_treatment_id": treatment_id})
    return data or {}


async def complete_treatment(jwt: str, treatment_id: str) -> dict:
    data = await _call(jwt, "app_complete_treatment", {"p_treatment_id": treatment_id})
    return data
