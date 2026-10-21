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
    # No defaults: the backend must be told explicitly where images live.
    storage_backend: str = Field(default="", alias="STORAGE_BACKEND")
    storage_local_dir: str = Field(
        default="uploads", alias="STORAGE_LOCAL_DIR"
    )
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_key: str = Field(default="", alias="SUPABASE_SERVICE_KEY")
    supabase_bucket: str = Field(default="", alias="SUPABASE_BUCKET")
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

# Settings whose built-in default is a dev value; production must set them.
_PROD_REQUIRED = (
    "database_url",
    "jwt_secret",
    "initial_admin_email",
    "initial_admin_password",
    "api_base_url",
    "frontend_url",
    "allowed_origins_raw",
    "n8n_webhook_secret",
)
# Settings that must never point at the local machine in production.
_NO_LOCALHOST = (
    "database_url",
    "api_base_url",
    "frontend_url",
    "allowed_origins_raw",
)
_STORAGE_REQUIRED: dict[str, tuple[str, ...]] = {
    "local": (),
    "supabase": ("supabase_url", "supabase_service_key", "supabase_bucket"),
}


def _is_local(value: str) -> bool:
    return "localhost" in value or "127.0.0.1" in value


def _collect_problems(s: Settings) -> list[str]:
    """Return every configuration problem, so one boot reports them all."""
    problems: list[str] = []
    prod = s.env == "production"

    if s.storage_backend not in _STORAGE_REQUIRED:
        problems.append("STORAGE_BACKEND must be 'local' or 'supabase'")
    else:
        problems += [
            f"{name.upper()} is required when STORAGE_BACKEND={s.storage_backend}"
            for name in _STORAGE_REQUIRED[s.storage_backend]
            if not getattr(s, name)
        ]
    if not prod:
        return problems

    problems += [
        f"{name.upper()} is not set"
        for name in _PROD_REQUIRED
        if name not in s.model_fields_set
    ]
    problems += [
        f"{name.upper()} still has a placeholder value"
        for name, bad in _INSECURE_DEFAULTS.items()
        if getattr(s, name) in (bad, "change-me", "password")
    ]
    problems += [
        f"{name.upper()} must not point to localhost in production"
        for name in _NO_LOCALHOST
        if _is_local(getattr(s, name))
    ]
    if s.storage_backend == "local":
        problems.append(
            "STORAGE_BACKEND=local loses images on redeploy; use 'supabase'"
        )
    return problems


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    problems = _collect_problems(s)
    if problems:
        # SystemExit: uvicorn prints one line instead of an import traceback.
        raise SystemExit(
            f"Invalid configuration, set in {_ENV_FILE} (or host env vars): "
            + "; ".join(problems)
        )
    return s


settings = get_settings()
