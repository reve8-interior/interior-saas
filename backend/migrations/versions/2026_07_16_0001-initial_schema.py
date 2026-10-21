"""Initial schema for Interior Designer Portal

Revision ID: 0001
Revises:
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("admin", "designer", name="user_role"),
            nullable=False,
            server_default="designer",
        ),
        sa.Column(
            "is_active", sa.Boolean, nullable=False, server_default="true"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "clients",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("contact_info", postgresql.JSONB, server_default="{}"),
        sa.Column(
            "assigned_designer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "current_phase",
            sa.Enum(
                "discussion",
                "design",
                "quotation",
                "implementation",
                "completed",
                name="project_phase",
            ),
            nullable=False,
            server_default="discussion",
        ),
        sa.Column("notes", sa.String(2000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "checkpoints",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("summary_text", sa.Text, nullable=False),
        sa.Column("structured_diff", postgresql.JSONB, server_default="{}"),
        sa.Column(
            "status",
            sa.Enum(
                "draft", "under_review", "agreed", name="checkpoint_status"
            ),
            nullable=False,
            server_default="draft",
        ),
        sa.Column(
            "source",
            sa.Enum("chat", "manual", name="checkpoint_source"),
            nullable=False,
            server_default="manual",
        ),
        sa.Column("raw_conversation", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_checkpoints_client_id", "checkpoints", ["client_id"])

    op.create_table(
        "final_summaries",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "checkpoint_id_ref",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("checkpoints.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("summary_text", sa.Text, nullable=False),
        sa.Column(
            "confirmed_by",
            sa.Enum(
                "client_reply", "designer_override", name="confirmation_method"
            ),
            nullable=True,
        ),
        sa.Column(
            "confirmed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "designs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source",
            sa.Enum("ai_generated", "designer_uploaded", name="design_source"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("image_url", sa.String(1000), nullable=True),
        sa.Column("specs_json", postgresql.JSONB, server_default="{}"),
        sa.Column(
            "is_selected", sa.Boolean, nullable=False, server_default="false"
        ),
        sa.Column("description", sa.String(2000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_designs_client_id", "designs", ["client_id"])

    op.create_table(
        "materials_rates",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column(
            "unit", sa.String(50), nullable=False, server_default="sqft"
        ),
        sa.Column("unit_cost", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_materials_rates_category", "materials_rates", ["category"]
    )

    op.create_table(
        "margin_config",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("category", sa.String(100), nullable=True, unique=True),
        sa.Column("margin_percent", sa.Numeric(5, 2), nullable=False),
    )

    op.create_table(
        "quotations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "design_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("designs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("breakdown_json", postgresql.JSONB, server_default="{}"),
        sa.Column("total_min", sa.Numeric(14, 2), nullable=True),
        sa.Column("total_max", sa.Numeric(14, 2), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", name="quotation_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_quotations_client_id", "quotations", ["client_id"])

    op.create_table(
        "audit_log",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.String(255), nullable=True),
        sa.Column("payload", postgresql.JSONB, server_default="{}"),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_audit_log_timestamp", "audit_log", ["timestamp"])

    # Seed global margin default (15%)
    op.execute(
        "INSERT INTO margin_config (id, category, margin_percent) VALUES (uuid_generate_v4(), NULL, 15.00)"
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("quotations")
    op.drop_table("margin_config")
    op.drop_table("materials_rates")
    op.drop_table("designs")
    op.drop_table("final_summaries")
    op.drop_table("checkpoints")
    op.drop_table("clients")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS user_role")
    op.execute("DROP TYPE IF EXISTS project_phase")
    op.execute("DROP TYPE IF EXISTS checkpoint_status")
    op.execute("DROP TYPE IF EXISTS checkpoint_source")
    op.execute("DROP TYPE IF EXISTS design_source")
    op.execute("DROP TYPE IF EXISTS confirmation_method")
    op.execute("DROP TYPE IF EXISTS quotation_status")
