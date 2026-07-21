"""Store each profile's display currency.

Revision ID: 20260721_0005
Revises: 20260721_0004
Create Date: 2026-07-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260721_0005"
down_revision = "20260721_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("currency", sa.String(length=3), nullable=False, server_default="PEN"))


def downgrade() -> None:
    op.drop_column("profiles", "currency")
