import base64
import binascii
import hashlib
import hmac
import json
import secrets
import time
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Header, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings
from app.db import get_db
from app.schemas.auth import DemoAuthResponse, GoogleAuthRequest, UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])
DEMO_TOKEN_PREFIX = "served-demo."
DEMO_TOKEN_TTL_SECONDS = 2 * 60 * 60
DEMO_SCOPE = "reviewed_samples"


@router.get("/client-id")
async def auth_client_id() -> dict[str, str]:
    """Return the Google OAuth client ID for the frontend (same contract as Lumper)."""
    return {"client_id": settings.google_client_id}


def _profile_from_claims(claims: dict) -> UserProfile:
    subject = str(claims.get("sub") or "")
    if not subject:
        raise HTTPException(status_code=401, detail="Google token has no subject.")
    email = str(claims.get("email") or "")
    if not email or claims.get("email_verified") is False:
        raise HTTPException(status_code=401, detail="Google email is not verified.")
    return UserProfile(
        subject=subject,
        email=email,
        name=str(claims.get("name") or email),
        given_name=str(claims.get("given_name") or ""),
        picture=claims.get("picture"),
    )


def _demo_signing_key() -> bytes:
    configured = settings.demo_token_secret.get_secret_value().strip()
    secret = (
        configured
        or settings.google_client_secret.strip()
        or settings.effective_plaid_secret()
        or settings.openai_api_key.strip()
    )
    if not secret:
        raise HTTPException(status_code=503, detail="Sample demo access is not configured.")
    return hashlib.sha256(f"served-demo-v1:{secret}".encode("utf-8")).digest()


def _encode_demo_token(*, session_id: str, expires_at: int) -> str:
    payload = json.dumps(
        {"sid": session_id, "exp": expires_at, "scope": DEMO_SCOPE},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    encoded = base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")
    signature = hmac.new(_demo_signing_key(), encoded.encode("ascii"), hashlib.sha256)
    signed = base64.urlsafe_b64encode(signature.digest()).rstrip(b"=").decode("ascii")
    return f"{DEMO_TOKEN_PREFIX}{encoded}.{signed}"


def _decode_demo_token(token: str) -> UserProfile:
    try:
        encoded, supplied_signature = token.removeprefix(DEMO_TOKEN_PREFIX).split(".", 1)
        expected_signature = hmac.new(
            _demo_signing_key(),
            encoded.encode("ascii"),
            hashlib.sha256,
        ).digest()
        decoded_signature = base64.urlsafe_b64decode(
            supplied_signature + "=" * (-len(supplied_signature) % 4)
        )
        if not hmac.compare_digest(decoded_signature, expected_signature):
            raise ValueError("invalid signature")
        payload = json.loads(
            base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        )
        session_id = str(payload.get("sid") or "")
        if (
            not session_id
            or payload.get("scope") != DEMO_SCOPE
            or int(payload.get("exp") or 0) < int(time.time())
        ):
            raise ValueError("expired or invalid scope")
    except (
        AttributeError,
        binascii.Error,
        TypeError,
        ValueError,
        json.JSONDecodeError,
    ):
        raise HTTPException(status_code=401, detail="Invalid or expired demo session.") from None
    return UserProfile(
        subject=f"demo:{session_id}",
        email="demo@served.local",
        name="Served Demo",
        given_name="Demo",
        picture=None,
    )


def is_demo_profile(profile: UserProfile) -> bool:
    return profile.subject.startswith("demo:")


def _verify_google_token(token: str) -> UserProfile:
    if token.startswith(DEMO_TOKEN_PREFIX):
        return _decode_demo_token(token)
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured.")
    try:
        claims = id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
        return _profile_from_claims(claims)
    except HTTPException:
        raise
    except Exception:
        response = httpx.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token}"},
            timeout=8,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired Google token.")
        return _profile_from_claims(response.json())


@router.post("/demo", response_model=DemoAuthResponse)
async def demo_auth() -> DemoAuthResponse:
    expires_at = int(time.time()) + DEMO_TOKEN_TTL_SECONDS
    return DemoAuthResponse(
        credential=_encode_demo_token(
            session_id="sample-judge",
            expires_at=expires_at,
        ),
        expires_in=DEMO_TOKEN_TTL_SECONDS,
    )


@router.post("/google", response_model=UserProfile)
async def google_auth(body: GoogleAuthRequest) -> UserProfile:
    profile = _verify_google_token(body.credential)
    await _save_login(profile)
    return profile


@router.get("/verify", response_model=UserProfile)
async def verify_google_auth(authorization: str = Header(default="")) -> UserProfile:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    profile = _verify_google_token(token)
    await _save_login(profile)
    return profile


async def _save_login(profile: UserProfile) -> None:
    """Upsert by Google's immutable subject, retaining email changes safely."""
    if is_demo_profile(profile):
        return
    try:
        await get_db().users.update_one(
            {"google_subject": profile.subject},
            {"$set": {
                "google_subject": profile.subject,
                **profile.model_dump(),
                "last_login_at": datetime.now(UTC),
            }},
            upsert=True,
        )
    except Exception:
        # Authentication must still complete when Mongo is temporarily unavailable.
        # The dashboard will show an empty state until persistence is restored.
        return
