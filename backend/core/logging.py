"""
Structured logging configuration for the Interior Designer Portal backend.

Call ``configure_structlog()`` once at application startup (in main.py)
before any other module that uses logging is imported.

All modules should import ``logger`` from here instead of calling
``logging.getLogger`` or ``structlog.get_logger`` directly.
"""

from __future__ import annotations

import logging
import sys
import traceback
from typing import Any

import structlog

# NOTE: these APP_MARKERS are used to identify our app's files but /opt and
# directory names may change in the future. So, keep an eye on this
# if logs stop showing filenames/linenos.

_APP_MARKERS = (
    "/opt/backend",
    "interior-designer-portal/backend",
    "interior-designer-portal\\backend",
)


def _app_callsite_processor(
    _logger: Any, _method: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Add filename/lineno from the nearest app frame, skipping pkg frames."""
    for frame in reversed(traceback.extract_stack()):
        if any(m in frame.filename for m in _APP_MARKERS):
            rel = frame.filename.split("backend")[-1].lstrip("/\\")
            # skip this logging module itself and structlog internals
            if rel in ("core/logging.py", "core\\logging.py"):
                continue
            event_dict["filename"] = rel
            event_dict["lineno"] = frame.lineno
            return event_dict
    return event_dict


def configure_structlog(json_logs: bool = True) -> None:
    """
    Configure structlog for structured logging.

    In dev (json_logs=False): coloured human-readable console output.
    In prod (json_logs=True): JSON lines for Loki/Datadog aggregators.

    Uvicorn and stdlib loggers are bridged through structlog so all output
    shares the same format and renderer.
    """
    # Processors shared between structlog-native and stdlib-bridged paths.
    # These run before the final renderer.
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="%H:%M:%S", utc=False),
        structlog.processors.StackInfoRenderer(),
        _app_callsite_processor,
    ]

    if json_logs:
        processors = [
            *shared_processors,
            structlog.processors.ExceptionRenderer(),
            structlog.processors.JSONRenderer(),
        ]
        # stdlib handler that re-renders through structlog's JSON chain
        stdlib_formatter = structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared_processors,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.processors.ExceptionRenderer(),
                structlog.processors.JSONRenderer(),
            ],
        )
    else:
        processors = [
            *shared_processors,
            structlog.dev.ConsoleRenderer(
                colors=True,
                exception_formatter=structlog.dev.plain_traceback,
            ),
        ]
        # stdlib handler that re-renders through structlog's console chain
        stdlib_formatter = structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared_processors,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.dev.ConsoleRenderer(
                    colors=True,
                    exception_formatter=structlog.dev.plain_traceback,
                ),
            ],
        )

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Replace root handler with one that goes through structlog's renderer
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(stdlib_formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    # Quiet noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    # Uvicorn: suppress its default handler and let root handler take over
    for uv_logger in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv = logging.getLogger(uv_logger)
        uv.handlers.clear()
        uv.propagate = True


# Module-level logger — use this everywhere instead of logging.getLogger
logger: structlog.BoundLogger = structlog.get_logger("designer-portal")
