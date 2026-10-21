"""create the private design-images storage bucket on Supabase

Revision ID: 0031
Revises: 0030
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None

BUCKET = "design-images"
# Keep >= the largest per-business max_image_mb (and the global MAX_IMAGE_BYTES).
FILE_SIZE_LIMIT = 8 * 1024 * 1024


def upgrade() -> None:
    conn = op.get_bind()
    # Plain Postgres (local dev, tests) has no storage schema: nothing to do.
    if conn.scalar(sa.text("SELECT to_regclass('storage.buckets')")) is None:
        return
    conn.execute(
        sa.text(
            "INSERT INTO storage.buckets "
            "(id, name, public, file_size_limit, allowed_mime_types) "
            "VALUES (:id, :id, false, :size, "
            "ARRAY['image/jpeg','image/png','image/webp']) "
            "ON CONFLICT (id) DO NOTHING"
        ),
        {"id": BUCKET, "size": FILE_SIZE_LIMIT},
    )


def downgrade() -> None:
    # Deliberately keeps the bucket: dropping it would orphan stored images.
    pass
