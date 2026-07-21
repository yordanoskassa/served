import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.routes import api_router
from app.services import plaid as plaid_service

logger = logging.getLogger(__name__)


def _origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    if origin in settings.cors_origins:
        return True
    import re

    return bool(re.fullmatch(r"https://([a-z0-9-]+--)?servedai\.netlify\.app", origin))


class UnhandledErrorMiddleware(BaseHTTPMiddleware):
    """Return JSON (with CORS) instead of dropping the connection on unexpected errors."""

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            logger.exception("Unhandled error path=%s", request.url.path)
            headers: dict[str, str] = {}
            origin = request.headers.get("origin", "")
            if _origin_allowed(origin):
                headers["Access-Control-Allow-Origin"] = origin
                headers["Access-Control-Allow-Credentials"] = "true"
                headers["Vary"] = "Origin"
            return JSONResponse(
                status_code=500,
                content={"detail": "Server error. Check EasyPanel logs for Plaid or MongoDB."},
                headers=headers,
            )


def create_app() -> FastAPI:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s:     %(name)s - %(message)s",
        force=True,
    )
    plaid_service.log_startup_diagnostics()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Evidence-first legal mail triage.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=r"https://([a-z0-9-]+--)?servedai\.netlify\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(UnhandledErrorMiddleware)
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
