"""razorpay billing state on businesses and plans, payment event log

Revision ID: 0059
Revises: 0058
Create Date: 2026-11-05
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column("razorpay_plan_id_monthly", sa.String(64), nullable=True),
    )
    op.add_column(
        "plans",
        sa.Column("razorpay_plan_price_inr", sa.Integer(), nullable=True),
    )
    op.add_column(
        "businesses",
        sa.Column("razorpay_subscription_id", sa.String(64), nullable=True),
    )
    op.add_column(
        "businesses", sa.Column("billing_cycle", sa.String(10), nullable=True)
    )
    op.add_column(
        "businesses",
        sa.Column(
            "subscription_status",
            sa.String(16),
            nullable=False,
            server_default="none",
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "current_period_end", sa.DateTime(timezone=True), nullable=True
        ),
    )
    if "payment_events" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "payment_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "razorpay_event_id",
                sa.String(100),
                nullable=False,
                unique=True,
            ),
            sa.Column("event_type", sa.String(64), nullable=False),
            sa.Column(
                "business_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("businesses.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("payload", postgresql.JSONB(), nullable=True),
            sa.Column(
                "processed_at", sa.DateTime(timezone=True), nullable=False
            ),
        )
        op.create_index(
            "ix_payment_events_business_id", "payment_events", ["business_id"]
        )


def downgrade() -> None:
    op.drop_index("ix_payment_events_business_id", table_name="payment_events")
    op.drop_table("payment_events")
    for col in (
        "current_period_end",
        "subscription_status",
        "billing_cycle",
        "razorpay_subscription_id",
    ):
        op.drop_column("businesses", col)
    op.drop_column("plans", "razorpay_plan_price_inr")
    op.drop_column("plans", "razorpay_plan_id_monthly")
