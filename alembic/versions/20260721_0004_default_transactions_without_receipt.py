"""Default new transactions to no receipt evidence.

Revision ID: 20260721_0004
Revises: 20260721_0003
Create Date: 2026-07-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260721_0004"
down_revision = "20260721_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "transactions",
        "completed",
        existing_type=sa.Boolean(),
        server_default=sa.false(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "transactions",
        "completed",
        existing_type=sa.Boolean(),
        server_default=sa.true(),
        existing_nullable=False,
    )
