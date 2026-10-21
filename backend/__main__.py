"""Entry point for running the backend as a module with `python -m backend`."""

import os
import sys

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("ENV", "development") == "development",
        loop="uvloop" if sys.platform != "win32" else "asyncio",
        # Disable uvicorn's default log config so our structlog takes over
        log_config=None,
    )
