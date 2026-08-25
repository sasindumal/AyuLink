"""Bearer-token extraction. Supabase itself enforces the JWT (RLS + RPC
auth.uid() checks reject an invalid/expired token) — we only need the
`sub` claim here for logging/state, not signature verification."""

import base64
import json

from fastapi import Header, HTTPException


def _decode_sub(jwt: str) -> str:
    try:
        payload_b64 = jwt.split(".")[1]
        padding = "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
        return payload.get("sub", "")
    except Exception:
        return ""


async def get_patient_auth(authorization: str | None = Header(None)) -> tuple[str, str]:
    """Returns (jwt, patient_id) or raises 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    jwt = authorization.split(" ", 1)[1].strip()
    if not jwt:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    patient_id = _decode_sub(jwt)
    return jwt, patient_id
