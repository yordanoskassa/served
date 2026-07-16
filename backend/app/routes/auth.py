from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Header, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings
from app.db import get_db
from app.schemas.auth import GoogleAuthRequest, UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])


def _profile_from_claims(claims: dict) -> UserProfile:
    email = str(claims.get("email") or "")
    if not email or claims.get("email_verified") is False:
        raise HTTPException(status_code=401, detail="Google email is not verified.")
    return UserProfile(
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
    await get_db().users.update_one(
        {"email": profile.email},
        {"$set": {**profile.model_dump(), "last_login_at": datetime.now(UTC)}},
        upsert=True,
    )
    return profile


@router.get("/verify", response_model=UserProfile)
async def verify_google_auth(authorization: str = Header(default="")) -> UserProfile:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    return _verify_google_token(token)
