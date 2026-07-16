from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]
LUMPER_ENV = PROJECT_ROOT.parent / "lumper_app" / ".env"


class Settings(BaseSettings):
    app_name: str = "Served API"
    api_prefix: str = "/api"
    environment: str = "development"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
    ]
    openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("SERVED_OPENAI_API_KEY", "OPENAI_API_KEY"),
    )
    openai_model: str = Field(
        default="gpt-5.6",
        validation_alias=AliasChoices("SERVED_OPENAI_MODEL", "OPENAI_MODEL"),
    )
    max_upload_bytes: int = 20 * 1024 * 1024
    mongodb_uri: str = Field(
        default="mongodb://localhost:27017",
        validation_alias=AliasChoices("SERVED_MONGODB_URI", "MONGODB_URI"),
    )
    mongodb_db: str = Field(
        default="served",
        validation_alias=AliasChoices("SERVED_MONGODB_DB", "MONGODB_DB"),
    )
    google_client_id: str = Field(
        default="",
        validation_alias=AliasChoices("SERVED_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID"),
    )
    google_client_secret: str = Field(
        default="",
        validation_alias=AliasChoices("SERVED_GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"),
    )
    aws_access_key_id: str = Field(
        default="",
        validation_alias=AliasChoices("SERVED_AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"),
    )
    aws_secret_access_key: str = Field(
        default="",
        validation_alias=AliasChoices("SERVED_AWS_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY"),
    )
    aws_region: str = Field(
        default="us-east-2",
        validation_alias=AliasChoices("SERVED_AWS_REGION", "AWS_REGION"),
    )
    s3_bucket: str = Field(
        default="",
        validation_alias=AliasChoices("SERVED_S3_BUCKET", "S3_BUCKET"),
    )
    courtlistener_api_token: str = Field(
        default="",
        validation_alias=AliasChoices(
            "SERVED_COURTLISTENER_API_TOKEN", "COURTLISTENER_API_TOKEN"
        ),
    )

    # Reuse the local hack-week credentials, while allowing Served-specific
    # values to override them in backend/.env or the process environment.
    model_config = SettingsConfigDict(
        env_file=(LUMPER_ENV, PROJECT_ROOT / "backend" / ".env"),
        env_prefix="SERVED_",
        extra="ignore",
    )


settings = Settings()
