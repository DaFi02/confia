"""initial confIA PostgreSQL schema

Revision ID: 20260720_0001
Revises:
Create Date: 2026-07-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260720_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("users", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.create_table("profiles", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True), sa.Column("ingreso", sa.Numeric(12, 2), nullable=False), sa.Column("ahorro_pct", sa.Numeric(5, 2), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.create_table("fixed_expenses", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("profile_id", sa.Integer(), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False), sa.Column("name", sa.Text(), nullable=False), sa.Column("day", sa.Text()), sa.Column("varies", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("amount", sa.Numeric(12, 2)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.create_table("transactions", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("title", sa.Text(), nullable=False), sa.Column("category", sa.Text(), nullable=False), sa.Column("amount", sa.Numeric(12, 2), nullable=False), sa.Column("tx_date", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("icon", sa.Text(), nullable=False, server_default="payments"), sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("receipt_url", sa.Text()), sa.Column("fixed_expense_id", sa.Integer(), sa.ForeignKey("fixed_expenses.id", ondelete="SET NULL")), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.create_table("trust_score_history", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("date", sa.Date(), nullable=False), sa.Column("value", sa.Numeric(5, 2), nullable=False), sa.Column("max_value", sa.Numeric(5, 2), nullable=False), sa.Column("breakdown_json", postgresql.JSONB()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.UniqueConstraint("user_id", "date", name="uq_trust_score_history_user_date"))


def downgrade() -> None:
    op.drop_table("trust_score_history")
    op.drop_table("transactions")
    op.drop_table("fixed_expenses")
    op.drop_table("profiles")
    op.drop_table("users")
