import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .core.logging import configure_structlog, logger

_is_dev = os.getenv("ENV", "development") == "development"
configure_structlog(json_logs=not _is_dev)

from .core import init_db  # noqa: E402
from .core.bootstrap import bootstrap_admin  # noqa: E402
from .core.config import settings  # noqa: E402
from .routers import (  # noqa: E402
    admin_monitor,
    auth,
    business_users,
    businesses,
    checkpoint_ai,
    checkpoints,
    clients,
    dashboard,
    designs,
    materials,
    media,
    n8n,
    quotation_versions,
    quotations,
    share,
    team,
)
from .routers import settings as settings_router  # noqa: E402


def _read_version() -> str:
    """Version = first line of backend/CHANGELOG."""
    try:
        with open(Path(__file__).parent / "CHANGELOG", encoding="utf-8") as f:
            return f.readline().strip() or "0.0.0"
    except OSError:
        return "0.0.0"


APP_VERSION = _read_version()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("api_starting", service="interior-designer-portal")
    init_db()
    bootstrap_admin()
    try:
        from sqlalchemy import text as _sa_text

        from .core.database import engine as _engine

        with _engine.connect() as _conn:
            _conn.execute(_sa_text("SELECT 1"))
        logger.info("db_pool_warmed")
    except Exception as exc:
        logger.warning("db_pool_warm_failed", error=str(exc))
    yield
    logger.info("api_shutting_down")


app = FastAPI(
    title="Interior Designer Portal API",
    description="Backend API for the Interior Designer Client Management Portal",
    version=APP_VERSION,
    lifespan=lifespan,
    docs_url=None,
)


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui():
    response = get_swagger_ui_html(
        openapi_url=app.openapi_url or "/openapi.json",
        title="Interior Designer Portal — API Docs",
    )
    dark_css = """
    <style>
        body { background-color: #1b1b1b !important; }
        .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
        .swagger-ui .microlight { filter: invert(100%) hue-rotate(180deg); }
    </style>
    """
    body = response.body
    if isinstance(body, memoryview):
        body = body.tobytes()
    new_content = body.decode().replace("</head>", f"{dark_css}</head>")
    return HTMLResponse(content=new_content)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    schema.setdefault("components", {})["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
    }
    schema.setdefault("security", []).append({"BearerAuth": []})
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TimingMiddleware:
    """Log per-request latency and expose it as a Server-Timing header.

    Pure ASGI (not BaseHTTPMiddleware): no per-request task/stream wrapping.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(
        self, scope: Scope, receive: Receive, send: Send
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status = 0

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                elapsed = (time.perf_counter() - start) * 1000
                headers = MutableHeaders(scope=message)
                headers["Server-Timing"] = f"app;dur={elapsed:.1f}"
            await send(message)

        await self.app(scope, receive, send_wrapper)
        logger.info(
            "request_timing",
            method=scope["method"],
            path=scope["path"],
            status=status,
            duration_ms=round((time.perf_counter() - start) * 1000, 1),
        )


# add_middleware wraps outward: Timing is outermost, then GZip, then CORS.
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(TimingMiddleware)


@app.get("/", include_in_schema=False)
def root():
    return {"service": "interior-designer-portal", "version": APP_VERSION}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(
    admin_monitor.router, prefix="/api/v1/admin", tags=["Admin Monitor"]
)
app.include_router(
    businesses.router, prefix="/api/v1/businesses", tags=["Businesses"]
)
app.include_router(
    business_users.router, prefix="/api/v1/businesses", tags=["Business Users"]
)
app.include_router(team.router, prefix="/api/v1/team", tags=["Team"])
app.include_router(clients.router, prefix="/api/v1/clients", tags=["Clients"])
app.include_router(checkpoints.router, prefix="/api/v1", tags=["Checkpoints"])
app.include_router(
    checkpoint_ai.router, prefix="/api/v1", tags=["Checkpoint AI"]
)
app.include_router(designs.router, prefix="/api/v1", tags=["Designs"])
app.include_router(share.router, prefix="/api/v1", tags=["Share Links"])
app.include_router(
    share.public_router, prefix="/api/v1", tags=["Public Share"]
)
app.include_router(media.router, prefix="/api/v1", tags=["Media"])
app.include_router(quotations.router, prefix="/api/v1", tags=["Quotations"])
app.include_router(
    quotation_versions.router, prefix="/api/v1", tags=["Quotation Versions"]
)
app.include_router(
    quotation_versions.public_router,
    prefix="/api/v1",
    tags=["Public Quotation Share"],
)
app.include_router(materials.router, prefix="/api/v1", tags=["Materials"])
app.include_router(settings_router.router, prefix="/api/v1", tags=["Settings"])
app.include_router(n8n.router, prefix="/api/v1/n8n", tags=["n8n Webhook"])
app.include_router(
    dashboard.router, prefix="/api/v1/dashboard", tags=["Dashboard"]
)
