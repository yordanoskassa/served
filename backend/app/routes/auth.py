from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Header, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings
from app.db import get_db
from app.schemas.auth import GoogleAuthRequest, UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])


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


def _verify_google_token(token: str) -> UserProfile:
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
