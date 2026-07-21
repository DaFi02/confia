"""add external_id to users for session isolation

Revision ID: 20260720_0002
Revises: 20260720_0001
Create Date: 2026-07-20
"""

from alembic import op
import sqlalchemy as sa

revision = "20260720_0002"
down_revision = "20260720_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable first so any pre-existing rows (e.g. the old single implicit
    # user) don't fail the migration, then backfill + enforce not-null/unique.
    op.add_column("users", sa.Column("external_id", sa.Text(), nullable=True))
    op.execute("UPDATE users SET external_id = 'legacy-user-' || id WHERE external_id IS NULL")
    op.alter_column("users", "external_id", nullable=False)
    op.create_unique_constraint("uq_users_external_id", "users", ["external_id"])
    op.create_index("ix_users_external_id", "users", ["external_id"])


def downgrade() -> None:
    op.drop_index("ix_users_external_id", table_name="users")
    op.drop_constraint("uq_users_external_id", "users", type_="unique")
    op.drop_column("users", "external_id")
