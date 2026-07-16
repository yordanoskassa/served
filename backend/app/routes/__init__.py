from fastapi import APIRouter

from app.routes import analysis, auth, health, public_config

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(analysis.router)
api_router.include_router(auth.router)
api_router.include_router(public_config.router)

__all__ = ["api_router"]
