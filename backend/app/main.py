import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import api_router
from app.services import plaid as plaid_service

logger = logging.getLogger(__name__)


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
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
