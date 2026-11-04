"""add website projects and link designs to them

Revision ID: 0052
Revises: 0051
Create Date: 2026-11-02
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import BUSINESS_ID_DEFAULT, apply_rls
from sqlalchemy.dialects import postgresql

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "business_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
            server_default=sa.text(BUSINESS_ID_DEFAULT),
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("location", sa.String(255)),
        sa.Column("year", sa.Integer()),
        sa.Column("category", sa.String(100)),
        sa.Column("story", sa.Text()),
        sa.Column(
            "cover_design_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column(
            "position", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_projects_business_id", "projects", ["business_id"])
    # Added after both tables exist: designs.project_id references projects.
    op.add_column(
        "designs",
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "designs", sa.Column("project_position", sa.Integer(), nullable=True)
    )
    op.create_index("ix_designs_project_id", "designs", ["project_id"])
    op.create_foreign_key(
        "fk_projects_cover_design_id",
        "projects",
        "designs",
        ["cover_design_id"],
        ["id"],
        ondelete="SET NULL",
    )
    apply_rls(op.get_bind())


def downgrade() -> None:
    op.drop_constraint(
        "fk_projects_cover_design_id", "projects", type_="foreignkey"
    )
    op.drop_index("ix_designs_project_id", table_name="designs")
    op.drop_column("designs", "project_position")
    op.drop_column("designs", "project_id")
    op.execute("DROP POLICY IF EXISTS business_isolation ON projects")
    op.drop_table("projects")
