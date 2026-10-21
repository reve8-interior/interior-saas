import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings

_ENV = os.getenv("ENV", "development")
_ENV_FILE = ".env.prod" if _ENV == "production" else ".env.dev"


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    env: str = Field(default="development", alias="ENV")
    debug: bool = Field(default=True, alias="DEBUG")

    # Database
    database_url: str = Field(
        default="postgresql+psycopg://designer:designer@localhost:5432/designer_portal",
        alias="DATABASE_URL",
    )
    # Defaults suit Supabase's pooler (limited client connections);
    # override via DB_POOL_SIZE / DB_MAX_OVERFLOW if needed.
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_pre_ping: bool = True
    db_pool_recycle: int = 1800
    db_connect_timeout: int = 30

    # JWT / Auth
    jwt_secret: str = Field(
        default="change-me-in-production", alias="JWT_SECRET"
    )
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(
        default=60 * 24, alias="ACCESS_TOKEN_EXPIRE_MINUTES"
    )

    # Initial admin seed
    initial_admin_email: str = Field(
        default="admin@studio.com", alias="INITIAL_ADMIN_EMAIL"
    )
    initial_admin_password: str = Field(
        default="changeme", alias="INITIAL_ADMIN_PASSWORD"
    )

    # App URLs
    api_base_url: str = Field(
        default="http://localhost:8000", alias="API_BASE_URL"
    )
    frontend_url: str = Field(
        default="http://localhost:3000", alias="FRONTEND_URL"
    )

    # CORS
    allowed_origins_raw: str = Field(
        default="http://localhost:3000,http://localhost:3001",
        alias="ALLOWED_ORIGINS",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [
            o.strip() for o in self.allowed_origins_raw.split(",") if o.strip()
        ]

    # Design image storage: "supabase" (private bucket) or "local" (dev disk)
    storage_backend: str = Field(default="local", alias="STORAGE_BACKEND")
    storage_local_dir: str = Field(
        default="uploads", alias="STORAGE_LOCAL_DIR"
    )
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_key: str = Field(default="", alias="SUPABASE_SERVICE_KEY")
    supabase_bucket: str = Field(
        default="design-images", alias="SUPABASE_BUCKET"
    )
    max_image_bytes: int = Field(
        default=8 * 1024 * 1024, alias="MAX_IMAGE_BYTES"
    )
    # How long a signed image URL stays valid.
    media_url_ttl_seconds: int = Field(
        default=6 * 60 * 60, alias="MEDIA_URL_TTL_SECONDS"
    )

    # n8n webhook authentication
    n8n_webhook_secret: str = Field(
        default="change-me-n8n-secret", alias="N8N_WEBHOOK_SECRET"
    )

    # OpenAI API keys and models are per business (set in /admin)
    # Fernet key for secrets stored in the DB; derived from JWT_SECRET if empty.
    secrets_encryption_key: str = Field(
        default="", alias="SECRETS_ENCRYPTION_KEY"
    )

    class Config:
        env_file = _ENV_FILE
        env_file_encoding = "utf-8"
        extra = "ignore"


_INSECURE_DEFAULTS = {
    "jwt_secret": "change-me-in-production",
    "n8n_webhook_secret": "change-me-n8n-secret",
    "initial_admin_password": "changeme",
}


def _assert_production_safe(s: Settings) -> None:
    """Fail fast if production is booted with placeholder secrets."""
    problems = [
        name.upper()
        for name, bad in _INSECURE_DEFAULTS.items()
        if getattr(s, name) in (bad, "change-me", "password")
    ]
    if problems:
        raise RuntimeError(
            f"Insecure placeholder values for: {', '.join(problems)}"
        )


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    if s.storage_backend not in ("local", "supabase"):
        raise RuntimeError("STORAGE_BACKEND must be 'local' or 'supabase'")
    if s.storage_backend == "supabase" and not (
        s.supabase_url and s.supabase_service_key
    ):
        raise RuntimeError(
            "STORAGE_BACKEND=supabase requires SUPABASE_URL and "
            "SUPABASE_SERVICE_KEY"
        )
    if s.env == "production":
        _assert_production_safe(s)
    return s


settings = get_settings()
