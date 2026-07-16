from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/public")
async def public_config() -> dict[str, str | bool]:
    return {
        "google_client_id": settings.google_client_id,
        "google_auth_enabled": bool(settings.google_client_id),
        "environment": settings.environment,
    }
