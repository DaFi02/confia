"""store private receipt object metadata

Revision ID: 20260721_0006
Revises: 20260721_0005
Create Date: 2026-07-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260721_0006"
down_revision = "20260721_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("receipt_path", sa.Text(), nullable=True))
    op.add_column("transactions", sa.Column("receipt_status", sa.String(length=24), nullable=False, server_default="required"))
    op.add_column("transactions", sa.Column("receipt_content_type", sa.String(length=100), nullable=True))
    op.execute("UPDATE transactions SET receipt_status = CASE WHEN receipt_url IS NULL THEN 'required' ELSE 'uploaded' END")


def downgrade() -> None:
    op.drop_column("transactions", "receipt_content_type")
    op.drop_column("transactions", "receipt_status")
    op.drop_column("transactions", "receipt_path")
