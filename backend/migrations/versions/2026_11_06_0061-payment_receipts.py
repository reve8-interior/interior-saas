"""payments table so each captured payment has a receipt

Revision ID: 0061
Revises: 0060
Create Date: 2026-11-06
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import apply_rls
from sqlalchemy.dialects import postgresql

revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS payment_receipt_seq")
    if "payments" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "payments",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "business_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("businesses.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "razorpay_payment_id",
                sa.String(64),
                nullable=False,
                unique=True,
            ),
            sa.Column("razorpay_order_id", sa.String(64)),
            sa.Column("razorpay_subscription_id", sa.String(64)),
            sa.Column(
                "receipt_number", sa.String(32), nullable=False, unique=True
            ),
            sa.Column("plan_slug", sa.String(32), nullable=False),
            sa.Column("plan_name", sa.String(100), nullable=False),
            sa.Column("billing_cycle", sa.String(10), nullable=False),
            sa.Column("amount_paise", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(3), server_default="INR"),
            sa.Column("method", sa.String(32)),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("period_start", sa.DateTime(timezone=True)),
            sa.Column("period_end", sa.DateTime(timezone=True)),
        )
        op.create_index("ix_payments_business_id", "payments", ["business_id"])
    apply_rls(op.get_bind())


def downgrade() -> None:
    op.drop_index("ix_payments_business_id", table_name="payments")
    op.drop_table("payments")
    op.execute("DROP SEQUENCE IF EXISTS payment_receipt_seq")
