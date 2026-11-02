"""Upload the sample client's room photos to the configured storage.

Run once per environment from the repo root; safe to repeat:
    python -m backend.upload_sample_images         # dev: .env.dev
    python -m backend.upload_sample_images --prod  # production: .env.prod
"""

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Settings read ENV and the env file when first imported, and look for the file
# in the current directory, so load it by absolute path before importing them.
# Dev is the default; pass --prod to upload to production's bucket.
_PROD = "--prod" in sys.argv
os.environ["ENV"] = "production" if _PROD else "development"
load_dotenv(
    Path(__file__).resolve().parent / (".env.prod" if _PROD else ".env.dev")
)

from .services.sample_client import (  # noqa: E402
    SAMPLE_PHOTO_SOURCES,
    SAMPLE_PREFIX,
)
from .services.storage import CONTENT_TYPES, get_storage  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("upload_sample_images")

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def main() -> int:
    """Copy each photo from data/ into storage; returns a process exit code."""
    storage = get_storage()
    for name, source in SAMPLE_PHOTO_SOURCES.items():
        file = DATA_DIR / source
        if not file.is_file():
            logger.error("Missing %s", file)
            return 1
        storage.put(
            f"{SAMPLE_PREFIX}/{name}", file.read_bytes(), CONTENT_TYPES["jpg"]
        )
        logger.info("Uploaded %s/%s", SAMPLE_PREFIX, name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
