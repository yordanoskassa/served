from pathlib import Path

from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
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
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000",
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
    resend_api_key: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices("SERVED_RESEND_API_KEY", "RESEND_API_KEY"),
    )
    resend_from_email: str = Field(
        default="",
        validation_alias=AliasChoices(
            "SERVED_RESEND_FROM_EMAIL", "RESEND_FROM_EMAIL"
        ),
    )
    resend_reply_to: str = Field(
        default="",
        validation_alias=AliasChoices(
            "SERVED_RESEND_REPLY_TO", "RESEND_REPLY_TO"
        ),
    )
    plaid_client_id: str = Field(
        default="",
        validation_alias=AliasChoices("SERVED_PLAID_CLIENT_ID", "PLAID_CLIENT_ID"),
    )
    plaid_secret: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices("SERVED_PLAID_SECRET", "PLAID_SECRET"),
    )
    plaid_sandbox_secret: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices(
            "SERVED_PLAID_SANDBOX_SECRET", "PLAID_SANDBOX_SECRET"
        ),
    )
    plaid_production_secret: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices(
            "SERVED_PLAID_PRODUCTION_SECRET", "PLAID_PRODUCTION_SECRET"
        ),
    )
    plaid_environment: Literal["sandbox", "development", "production"] = Field(
        default="sandbox",
        validation_alias=AliasChoices(
            "SERVED_PLAID_ENVIRONMENT", "PLAID_ENVIRONMENT", "PLAID_ENV"
        ),
    )
    plaid_redirect_uri: str = Field(
        default="",
        validation_alias=AliasChoices(
            "SERVED_PLAID_REDIRECT_URI", "PLAID_REDIRECT_URI"
        ),
    )

    def effective_plaid_secret(self) -> str:
        """Prefer PLAID_SECRET; otherwise pick sandbox vs production secret."""
        explicit = self.plaid_secret.get_secret_value().strip()
        if explicit:
            return explicit
        if self.plaid_environment == "production":
            return self.plaid_production_secret.get_secret_value().strip()
        return self.plaid_sandbox_secret.get_secret_value().strip()

    @property
    def plaid_configured(self) -> bool:
        return bool(self.plaid_client_id.strip() and self.effective_plaid_secret())

    @field_validator("cors_origins")
    @classmethod
    def include_loopback_dev_origins(cls, origins: list[str]) -> list[str]:
        expanded = list(origins)
        for origin in origins:
            if origin.startswith("http://localhost:"):
                expanded.append(origin.replace("http://localhost:", "http://127.0.0.1:", 1))
        return list(dict.fromkeys(expanded))

    # Reuse the local hack-week credentials, while allowing Served-specific
    # values to override them in backend/.env or the process environment.
    model_config = SettingsConfigDict(
        env_file=(LUMPER_ENV, PROJECT_ROOT / "backend" / ".env"),
        env_prefix="SERVED_",
        extra="ignore",
    )


settings = Settings()
