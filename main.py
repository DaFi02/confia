import calendar
import base64
import hmac
import hashlib
import io
import json
import os
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pandas as pd
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from receipt_storage import ReceiptStorage, ReceiptStorageError

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL debe estar configurada para iniciar confIA.")


def _async_database_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Anonymous per-browser identifier sent by the frontend as `X-Session-Id`
    # (generated client-side and stored in localStorage). Lets multiple people
    # use the same deployment concurrently without sharing one implicit user.
    external_id: Mapped[str] = mapped_column(Text, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProfileRecord(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    ingreso: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    ahorro_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    currency: Mapped[str] = mapped_column(String(3), default="PEN", server_default="PEN")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    fixed_expenses: Mapped[list["FixedExpenseRecord"]] = relationship(cascade="all, delete-orphan")


class FixedExpenseRecord(Base):
    __tablename__ = "fixed_expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    day: Mapped[str | None] = mapped_column(Text, nullable=True)
    varies: Mapped[bool] = mapped_column(Boolean, default=False)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TransactionRecord(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    tx_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    icon: Mapped[str] = mapped_column(Text, default="payments")
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    receipt_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    receipt_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    receipt_status: Mapped[str] = mapped_column(String(24), default="required", server_default="required")
    receipt_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fixed_expense_id: Mapped[int | None] = mapped_column(ForeignKey("fixed_expenses.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TrustScoreHistory(Base):
    __tablename__ = "trust_score_history"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_trust_score_history_user_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    value: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    max_value: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    breakdown_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProactiveInsightRecord(Base):
    """Latest assistant brief for a visitor.

    The brief is deliberately cached: viewing Home can be frequent, while a
    thoughtful NIM analysis only needs to run when financial data changes or
    the previous brief is old.
    """
    __tablename__ = "proactive_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    data_signature: Mapped[str] = mapped_column(Text)
    payload_json: Mapped[dict] = mapped_column(JSONB)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


engine = create_async_engine(_async_database_url(DATABASE_URL), pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

app = FastAPI(title="confIA API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

RECEIPT_CATEGORIES = ["Transporte", "Alimentación", "Ocio", "Servicios", "Salario", "Otros"]
GASTOS_HORMIGA_THRESHOLD = 20.0
PROACTIVE_INSIGHT_REFRESH_HOURS = max(1, int(os.environ.get("PROACTIVE_INSIGHT_REFRESH_HOURS", "6")))
RECEIPT_ACCESS_SECRET = os.environ.get("RECEIPT_ACCESS_SECRET") or hashlib.sha256(DATABASE_URL.encode()).hexdigest()
RECEIPT_ACCESS_TTL_SECONDS = max(60, int(os.environ.get("RECEIPT_ACCESS_TTL_SECONDS", "300")))
receipt_storage = ReceiptStorage.from_environment()
_NVIDIA_RECOMMENDATIONS_DEFAULT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
_NVIDIA_RECEIPT_MODEL = os.environ.get("NVIDIA_RECEIPT_MODEL", "nvidia/llama-3.1-nemotron-nano-vl-8b-v1")
# Used only when the caller doesn't send X-Session-Id (e.g. curl, tests, old
# clients). Isolates them into their own single bucket instead of touching a
# real visitor's data.
_LEGACY_SESSION_ID = "legacy-no-session"


class FixedExpense(BaseModel):
    name: str
    day: str | None = None
    varies: bool = False
    amount: float | None = None


class OnboardingProfile(BaseModel):
    ingreso: float
    gastos_fijos: list[FixedExpense] = []
    ahorro_pct: float
    currency: str = "PEN"


CURRENCIES = {"PEN", "ARS", "BOB", "BRL", "CLP", "COP", "CRC", "CUP", "DOP", "GTQ", "HNL", "MXN", "NIO", "PAB", "PYG", "UYU", "VES", "USD", "EUR", "GBP", "CHF", "CZK", "DKK", "HUF", "NOK", "PLN", "RON", "SEK"}


class Transaction(BaseModel):
    id: int
    title: str
    category: str
    amount: float
    date: str
    icon: str
    completed: bool = True


class NewTransaction(BaseModel):
    title: str
    category: str
    amount: float
    icon: str = "payments"
    # Additive fields for non-frontend callers that persist receipt evidence.
    # A transaction is only backed by evidence when a receipt is attached.
    # Previously this default made every manual/AI entry look as if it had a
    # receipt in the history filters.
    completed: bool = False
    receipt_url: str | None = None


class UpdateTransaction(BaseModel):
    title: str | None = None
    category: str | None = None
    amount: float | None = None
    date: str | None = None
    icon: str | None = None
    completed: bool | None = None
    receipt_url: str | None = None


class ChatMessage(BaseModel):
    message: str


class ReceiptScanRequest(BaseModel):
    image: str


_EXPENSE_ICON_KEYWORDS = [("alquiler", "home"), ("renta", "home"), ("luz", "bolt"), ("electric", "bolt"), ("internet", "wifi"), ("wifi", "wifi"), ("netflix", "subscriptions"), ("spotify", "subscriptions"), ("agua", "water_drop"), ("gimnasio", "fitness_center"), ("seguro", "health_and_safety"), ("telefono", "smartphone"), ("teléfono", "smartphone")]
_CHART_COLORS = ["#6366f1", "#4ae176", "#da3437", "#f59e0b", "#06b6d4", "#a855f7", "#ec4899"]


def _require_receipt_for_expense(amount: float, receipt_url: str | None) -> None:
    """Expenses need evidence; an uploaded image does not need AI parsing to count."""
    if amount < 0 and not receipt_url:
        raise HTTPException(
            status_code=422,
            detail="Attach a receipt before saving an expense.",
        )


def _icon_for_expense_name(name: str) -> str:
    lower = name.lower()
    return next((icon for keyword, icon in _EXPENSE_ICON_KEYWORDS if keyword in lower), "receipt_long")


def _trust_score_label(value: float, max_value: float = 20, lang: str = "en") -> str:
    pct = value / max_value if max_value else 0
    if lang == "es":
        if pct >= 0.85:
            return "Excelente"
        if pct >= 0.6:
            return "Saludable"
        if pct >= 0.35:
            return "Regular"
        return "Necesita atención"
    if pct >= 0.85:
        return "Excellent"
    if pct >= 0.6:
        return "Healthy"
    if pct >= 0.35:
        return "Fair"
    return "Needs attention"


def _to_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


_UTC = ZoneInfo("UTC")


def _resolve_timezone(x_timezone: str | None) -> ZoneInfo:
    """Resolves the visitor's IANA timezone (sent by the frontend as
    `X-Timezone`, e.g. "America/Lima"), so "today" and every day/month bucket
    (daily budget, trust score, safety cushion, analytics) match the
    visitor's own calendar day instead of the server's local time or a fixed
    UTC day. This is a global hackathon — visitors in different timezones
    each get their own "today". Falls back to UTC on a missing/invalid
    header so the API never 500s on a bad value.
    """
    if not x_timezone:
        return _UTC
    try:
        return ZoneInfo(x_timezone)
    except (ZoneInfoNotFoundError, ValueError):
        return _UTC


def _localize(value: datetime, tz: ZoneInfo) -> datetime:
    return _to_utc(value).astimezone(tz)


def _resolve_language(x_language: str | None) -> str:
    """Resolves the visitor's UI language (sent by the frontend as
    `X-Language`, "en" or "es").

    The frontend's DOM-text translator only matches static, non-interpolated
    strings, so anything the API builds with live data (dates, trust-score
    labels, AI insight copy) must be translated here instead — otherwise it
    leaks through untranslated regardless of which language is selected.
    Defaults to "en" (the app's current default UI language) for missing or
    invalid values.
    """
    return "es" if x_language == "es" else "en"


def _serialize_date(value: datetime, tz: ZoneInfo, lang: str = "en") -> str:
    value = _localize(value, tz)
    today = datetime.now(tz).date()
    if lang == "es":
        if value.date() == today:
            return "Hoy" if value.hour == 0 and value.minute == 0 else f"Hoy, {value:%I:%M %p}".replace(" 0", " ")
        if value.date() == today - timedelta(days=1):
            return f"Ayer, {value:%I:%M %p}".replace(" 0", " ")
        return value.strftime("%d %b, %Y")
    if value.date() == today:
        return "Today" if value.hour == 0 and value.minute == 0 else f"Today, {value:%I:%M %p}".replace(" 0", " ")
    if value.date() == today - timedelta(days=1):
        return f"Yesterday, {value:%I:%M %p}".replace(" 0", " ")
    return value.strftime("%b %d, %Y")


def _receipt_access_token(user_id: int, transaction_id: int) -> str:
    expires_at = int(datetime.now(timezone.utc).timestamp()) + RECEIPT_ACCESS_TTL_SECONDS
    payload = f"{user_id}:{transaction_id}:{expires_at}".encode()
    signature = hmac.new(RECEIPT_ACCESS_SECRET.encode(), payload, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload + b"." + signature).decode().rstrip("=")


def _valid_receipt_access_token(token: str, user_id: int, transaction_id: int) -> bool:
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode())
        payload, supplied_signature = raw.rsplit(b".", 1)
        expected_signature = hmac.new(RECEIPT_ACCESS_SECRET.encode(), payload, hashlib.sha256).digest()
        token_user, token_transaction, expires_at = payload.decode().split(":")
        return (
            hmac.compare_digest(supplied_signature, expected_signature)
            and int(token_user) == user_id
            and int(token_transaction) == transaction_id
            and int(expires_at) >= int(datetime.now(timezone.utc).timestamp())
        )
    except (ValueError, UnicodeDecodeError, base64.binascii.Error):
        return False


def _receipt_view_url(tx: TransactionRecord) -> str | None:
    if tx.receipt_path:
        token = _receipt_access_token(tx.user_id, tx.id)
        # The frontend resolves this relative route using NEXT_PUBLIC_API_URL.
        # That avoids broken receipt previews when PUBLIC_API_URL was omitted
        # or still points to localhost after deployment.
        return f"/api/receipts/{tx.id}?token={token}"
    return tx.receipt_url


async def _store_receipt(user_id: int, receipt_url: str | None) -> tuple[str | None, str | None, str]:
    """Persist new data-URL evidence outside PostgreSQL.

    Existing URLs are deliberately not re-uploaded here: this preserves
    historical rows while all new receipts move to the private bucket.
    """
    if not receipt_url:
        return None, None, "required"
    if not receipt_url.startswith("data:"):
        raise HTTPException(422, "Send a valid new receipt image.")
    if receipt_storage is None:
        raise HTTPException(503, "Receipt storage is not configured.")
    try:
        stored = await receipt_storage.upload_data_url(user_id, receipt_url)
    except ReceiptStorageError as error:
        raise HTTPException(503, str(error)) from error
    return stored.path, stored.content_type, "uploaded"


def _serialize_transaction(tx: TransactionRecord, tz: ZoneInfo, lang: str = "en") -> dict:
    return {"id": tx.id, "title": tx.title, "category": tx.category, "amount": float(tx.amount), "date": _serialize_date(tx.tx_date, tz, lang), "icon": tx.icon, "completed": tx.completed, "receipt_url": _receipt_view_url(tx), "receipt_status": tx.receipt_status}


def _parse_transaction_date(value: str) -> datetime:
    value = value.strip()
    if value.lower() == "hoy":
        return datetime.now(timezone.utc)
    for candidate in (value, value.replace("Z", "+00:00")):
        try:
            parsed = datetime.fromisoformat(candidate)
            return _to_utc(parsed)
        except ValueError:
            pass
    for fmt in ("%d %b, %Y", "%d %b, %Y, %I:%M %p", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    raise HTTPException(status_code=422, detail="date must be an ISO date or a compatible date format")


def _due_day(value: str | None, reference: date) -> int | None:
    if not value:
        return None
    match = re.search(r"(?:^|-)0?(\d{1,2})$", value.strip())
    if not match:
        return None
    day = int(match.group(1))
    return day if 1 <= day <= calendar.monthrange(reference.year, reference.month)[1] else None


async def _resolve_user(session: AsyncSession, x_session_id: str | None) -> User:
    """Gets or creates the User tied to this browser's anonymous session id.

    Each visitor generates a UUID client-side (frontend/lib/api.ts) and sends
    it on every request as `X-Session-Id`. That's what keeps concurrent
    visitors from sharing profile/transaction data.
    """
    external_id = x_session_id or _LEGACY_SESSION_ID
    user = await session.scalar(select(User).where(User.external_id == external_id))
    if user is None:
        user = User(external_id=external_id)
        session.add(user)
        await session.flush()
    return user


async def _profile(session: AsyncSession, user_id: int) -> ProfileRecord | None:
    return await session.scalar(select(ProfileRecord).where(ProfileRecord.user_id == user_id))


async def _transactions(session: AsyncSession, user_id: int) -> list[TransactionRecord]:
    return list((await session.scalars(select(TransactionRecord).where(TransactionRecord.user_id == user_id).order_by(TransactionRecord.tx_date.desc(), TransactionRecord.id.desc()))).all())


async def _fixed_expenses(session: AsyncSession, profile: ProfileRecord | None) -> list[FixedExpenseRecord]:
    if profile is None:
        return []
    return list((await session.scalars(select(FixedExpenseRecord).where(FixedExpenseRecord.profile_id == profile.id).order_by(FixedExpenseRecord.id))).all())


def _month_transactions(transactions: list[TransactionRecord], month: date, tz: ZoneInfo) -> list[TransactionRecord]:
    return [tx for tx in transactions if _localize(tx.tx_date, tz).date().year == month.year and _localize(tx.tx_date, tz).date().month == month.month]


def _fixed_match(expense: FixedExpenseRecord, transactions: list[TransactionRecord], month: date, tz: ZoneInfo) -> TransactionRecord | None:
    matches = [tx for tx in _month_transactions(transactions, month, tz) if tx.fixed_expense_id == expense.id or expense.name.lower() in tx.title.lower()]
    return min(matches, key=lambda tx: _localize(tx.tx_date, tz)) if matches else None


def _fixed_status(expense: FixedExpenseRecord, transactions: list[TransactionRecord], month: date, tz: ZoneInfo) -> tuple[str, TransactionRecord | None]:
    match = _fixed_match(expense, transactions, month, tz)
    if not match:
        return "pendiente", None
    return ("pagado" if match.completed else "falta_comprobante"), match


def _daily_budget(profile: ProfileRecord | None, fixed_expenses: list[FixedExpenseRecord], transactions: list[TransactionRecord], today: date, tz: ZoneInfo) -> dict:
    """Calculate today's spendable amount from money actually recorded.

    ``profile.ingreso`` is a planning preference collected in onboarding, not
    proof that the money is available in the account.  Until at least one
    income transaction is registered for the current month, exposing a daily
    limit would make an empty account look funded.
    """
    if profile is None:
        return {"limit": 0.0, "spent": 0.0, "remaining": 0.0, "limit_pct": 0, "income_recorded": 0.0, "is_available": False}
    month_transactions = _month_transactions(transactions, today, tz)
    income = sum(float(tx.amount) for tx in month_transactions if tx.amount > 0)
    spent = sum(-float(tx.amount) for tx in month_transactions if tx.amount < 0 and _localize(tx.tx_date, tz).date() == today)
    if income <= 0:
        return {"limit": 0.0, "spent": round(spent, 2), "remaining": 0.0, "limit_pct": 0, "income_recorded": 0.0, "is_available": False}
    savings = income * (float(profile.ahorro_pct) / 100)
    fixed_total = sum(float(expense.amount or 0) for expense in fixed_expenses if not expense.varies)
    days_remaining = calendar.monthrange(today.year, today.month)[1] - today.day + 1
    limit = (income - fixed_total - savings) / days_remaining
    remaining_raw = limit - spent
    return {"limit": limit, "spent": round(spent, 2), "remaining": round(max(0, remaining_raw), 2), "limit_pct": 100 if limit <= 0 else min(100, round((spent / limit) * 100)), "income_recorded": round(income, 2), "is_available": True}


def _safety_cushion(transactions: list[TransactionRecord], today: date, tz: ZoneInfo) -> int:
    current_start = today.replace(day=1)
    historical_surplus = sum(float(tx.amount) for tx in transactions if _localize(tx.tx_date, tz).date() < current_start)
    current_surplus = sum(float(tx.amount) for tx in transactions if current_start <= _localize(tx.tx_date, tz).date() <= today)
    last_30 = today - timedelta(days=29)
    recent_expenses = [tx for tx in transactions if tx.amount < 0 and last_30 <= _localize(tx.tx_date, tz).date() <= today]
    data_days = len({_localize(tx.tx_date, tz).date() for tx in recent_expenses})
    average = sum(-float(tx.amount) for tx in recent_expenses) / min(30, data_days) if data_days else 0
    return max(0, round((historical_surplus + current_surplus) / average)) if average > 0 else 0


def _trust_score(profile: ProfileRecord | None, fixed_expenses: list[FixedExpenseRecord], transactions: list[TransactionRecord], today: date, tz: ZoneInfo) -> tuple[int, dict]:
    month_transactions = _month_transactions(transactions, today, tz)
    expenses = [tx for tx in month_transactions if tx.amount < 0]
    receipts_pct = sum(1 for tx in expenses if tx.receipt_url) / len(expenses) if expenses else 0
    daily = _daily_budget(profile, fixed_expenses, transactions, today, tz)
    days_elapsed = today.day
    under_limit = 0
    for day_number in range(1, days_elapsed + 1):
        day_spend = sum(-float(tx.amount) for tx in expenses if _localize(tx.tx_date, tz).date().day == day_number)
        if daily["limit"] > 0 and day_spend <= daily["limit"]:
            under_limit += 1
    limit_pct = under_limit / days_elapsed if days_elapsed else 0
    paid_early = 0
    for expense in fixed_expenses:
        status, match = _fixed_status(expense, transactions, today, tz)
        due = _due_day(expense.day, today)
        if status == "pagado" and match and (due is None or _localize(match.tx_date, tz).date().day <= due):
            paid_early += 1
    fixed_pct = paid_early / len(fixed_expenses) if fixed_expenses else 0
    breakdown = {"comprobantes_pct": round(receipts_pct, 4), "limite_diario_pct": round(limit_pct, 4), "pago_puntual_pct": round(fixed_pct, 4)}
    return round(8 * receipts_pct + 8 * limit_pct + 4 * fixed_pct), breakdown


async def _record_trust_score(session: AsyncSession, user_id: int, profile: ProfileRecord | None, fixed_expenses: list[FixedExpenseRecord], transactions: list[TransactionRecord], today: date, tz: ZoneInfo) -> tuple[int, dict]:
    value, breakdown = _trust_score(profile, fixed_expenses, transactions, today, tz)
    # Antes del onboarding no existe un usuario persistido ni hay un score que
    # conservar. Devolvemos el estado vacío para que Home y Analítica funcionen
    # desde una instalación limpia, sin insertar datos de demostración.
    if profile is None:
        return value, breakdown
    existing = await session.scalar(select(TrustScoreHistory).where(TrustScoreHistory.user_id == user_id, TrustScoreHistory.date == today))
    if existing:
        existing.value, existing.max_value, existing.breakdown_json = value, 20, breakdown
    else:
        session.add(TrustScoreHistory(user_id=user_id, date=today, value=value, max_value=20, breakdown_json=breakdown))
    await session.commit()
    return value, breakdown


def _proactive_snapshot(profile: ProfileRecord | None, fixed_expenses: list[FixedExpenseRecord], transactions: list[TransactionRecord], today: date, tz: ZoneInfo) -> dict:
    """Return the compact, explainable evidence sent to the assistant.

    This is intentionally aggregate-only: NVIDIA receives financial totals and
    category trends, never transaction titles, receipts, or identifiers.
    """
    monthly = _month_transactions(transactions, today, tz)
    month_expenses = sum(-float(tx.amount) for tx in monthly if tx.amount < 0)
    month_income = sum(float(tx.amount) for tx in monthly if tx.amount > 0)
    expected_income = float(profile.ingreso) if profile else 0.0
    income_for_projection = month_income or expected_income
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    projected_expenses = month_expenses / today.day * days_in_month if today.day else 0.0
    savings_target_pct = float(profile.ahorro_pct) if profile else 0.0
    savings_target = income_for_projection * savings_target_pct / 100
    projected_savings = income_for_projection - projected_expenses
    budget = _daily_budget(profile, fixed_expenses, transactions, today, tz)

    category_totals: dict[str, float] = {}
    for tx in monthly:
        if tx.amount < 0:
            category_totals[tx.category] = category_totals.get(tx.category, 0.0) - float(tx.amount)
    top_categories = [
        {"name": name, "amount": round(amount, 2), "pct": round(amount / month_expenses * 100) if month_expenses else 0}
        for name, amount in sorted(category_totals.items(), key=lambda item: item[1], reverse=True)[:3]
    ]

    recent_start, previous_start = today - timedelta(days=29), today - timedelta(days=59)
    recent_by_category: dict[str, float] = {}
    previous_by_category: dict[str, float] = {}
    for tx in transactions:
        if tx.amount >= 0:
            continue
        tx_day = _localize(tx.tx_date, tz).date()
        destination = recent_by_category if recent_start <= tx_day <= today else previous_by_category if previous_start <= tx_day < recent_start else None
        if destination is not None:
            destination[tx.category] = destination.get(tx.category, 0.0) - float(tx.amount)
    category_changes = [
        {"name": name, "pct_change": round((amount - previous_by_category.get(name, 0)) / previous_by_category[name] * 100) if previous_by_category.get(name) else None}
        for name, amount in recent_by_category.items()
    ]
    category_changes.sort(key=lambda item: item["pct_change"] if item["pct_change"] is not None else 0, reverse=True)

    return {
        "period": today.strftime("%Y-%m"),
        "day_of_month": today.day,
        "days_in_month": days_in_month,
        "income_recorded": round(month_income, 2),
        "income_for_projection": round(income_for_projection, 2),
        "expenses_to_date": round(month_expenses, 2),
        "projected_expenses": round(projected_expenses, 2),
        "projected_savings": round(projected_savings, 2),
        "savings_target": round(savings_target, 2),
        "savings_target_pct": savings_target_pct,
        "daily_budget_remaining": budget["remaining"],
        "daily_budget_limit": round(budget["limit"], 2),
        "top_categories": top_categories,
        "category_changes": category_changes[:3],
        "transaction_count": len(monthly),
    }


def _fallback_proactive_brief(snapshot: dict, lang: str = "en") -> dict:
    """Useful deterministic advice if NVIDIA is temporarily unreachable."""
    projected_gap = snapshot["savings_target"] - snapshot["projected_savings"]
    top_category = snapshot["top_categories"][0]["name"] if snapshot["top_categories"] else None
    insights = []
    if lang == "es":
        if snapshot["transaction_count"] == 0:
            insights.append({"id": "start", "priority": "info", "icon": "edit_note", "title": "Registra tus primeros movimientos", "message": "Con algunos gastos e ingresos podré detectar patrones y darte recomendaciones personales.", "action": "Registrar movimiento"})
        if projected_gap > 0:
            insights.append({"id": "savings", "priority": "warning", "icon": "savings", "title": "Protege tu meta de ahorro", "message": f"A este ritmo, podrías quedar ${projected_gap:.0f} por debajo de tu meta de ahorro. Aparta un monto pequeño antes de tu próximo gasto variable.", "action": "Ver insights"})
        else:
            insights.append({"id": "savings", "priority": "success", "icon": "trending_up", "title": "Vas encaminado a tu meta", "message": "Tu proyección actual protege la meta de ahorro. Mantén este ritmo y revisa tus gastos variables antes de cerrar el mes.", "action": "Ver proyección"})
        if top_category:
            insights.append({"id": "category", "priority": "info", "icon": "insights", "title": f"{top_category} lidera tus gastos", "message": "Es tu categoría más grande este mes. Un límite semanal simple puede darte más margen sin dejar de disfrutar lo que te gusta.", "action": "Revisar categoría"})
    else:
        if snapshot["transaction_count"] == 0:
            insights.append({"id": "start", "priority": "info", "icon": "edit_note", "title": "Log your first transactions", "message": "With a few income and expense entries, I can spot patterns and offer personal recommendations.", "action": "Add transaction"})
        if projected_gap > 0:
            insights.append({"id": "savings", "priority": "warning", "icon": "savings", "title": "Protect your savings goal", "message": f"At this pace, you may fall ${projected_gap:.0f} short of your savings goal. Set aside a small amount before your next variable expense.", "action": "View insights"})
        else:
            insights.append({"id": "savings", "priority": "success", "icon": "trending_up", "title": "You're on track", "message": "Your current projection supports your savings goal. Keep this pace and review variable expenses before month-end.", "action": "View projection"})
        if top_category:
            insights.append({"id": "category", "priority": "info", "icon": "insights", "title": f"{top_category} leads your spending", "message": "It's your biggest category this month. A simple weekly cap can give you more room without cutting out what you enjoy.", "action": "Review category"})
    return {"summary": insights[0]["message"], "insights": insights[:3], "generated_by": "fallback", "snapshot": snapshot}


def _nvidia_recommendations_config() -> dict | None:
    """Dedicated NIM connection for proactive advice, separate from AI Hub.

    Keeping this configuration separate lets recommendation quality/latency be
    tuned independently without changing transaction extraction behavior.
    """
    api_key = os.environ.get("NVIDIA_RECOMMENDATIONS_API_KEY")
    if not api_key:
        return None
    return {
        "api_key": api_key,
        "invoke_url": os.environ.get("NVIDIA_RECOMMENDATIONS_INVOKE_URL", _NVIDIA_RECOMMENDATIONS_DEFAULT_URL),
        "model": os.environ.get("NVIDIA_RECOMMENDATIONS_MODEL", "deepseek-ai/deepseek-v4-flash"),
    }


def _nvidia_proactive_brief(snapshot: dict, lang: str = "en") -> dict:
    fallback = _fallback_proactive_brief(snapshot, lang)
    config = _nvidia_recommendations_config()
    if config is None:
        return fallback
    language_instruction = (
        "Responde todo el contenido (summary, title, message, action) en español neutro."
        if lang == "es"
        else "Respond with all content (summary, title, message, action) in English."
    )
    prompt = f"""Eres confIA, un asistente financiero personal peruano, educativo, cercano y motivador. Analiza solo estos totales agregados: {json.dumps(snapshot, ensure_ascii=False)}.
No inventes datos, no juzgues, no des asesoría de inversión, crédito o impuestos, y no hagas promesas. Explica brevemente la evidencia y propone acciones pequeñas y realistas. {language_instruction} Responde ÚNICAMENTE JSON válido con esta forma exacta:
{{"summary": "máximo 180 caracteres", "insights": [{{"id":"string", "priority":"success|info|warning", "icon":"material symbol", "title":"máximo 55 caracteres", "message":"máximo 180 caracteres", "action":"máximo 32 caracteres"}}]}}
Devuelve 2 o 3 insights; prioriza proyección de ahorro, ritmo de gasto y una categoría relevante. Si transaction_count es 0, pide registrar movimientos y no proyectes."""
    # The brief is intentionally short. Keeping the output budget tight makes
    # this suitable for the Home request even on slower NIM model queues.
    payload = {
        "model": config["model"],
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.25,
        "top_p": 0.9,
        "max_tokens": 280,
        "seed": 0,
        # DeepSeek's long reasoning mode is valuable for complex research, but
        # an interactive, evidence-backed financial nudge should be concise.
        "chat_template_kwargs": {"thinking": False},
        "stream": False,
    }
    try:
        response = requests.post(config["invoke_url"], headers={"Authorization": f"Bearer {config['api_key']}", "Accept": "application/json"}, json=payload, timeout=(5, 45))
        response.raise_for_status()
        result = _parse_ai_json(response.json()["choices"][0]["message"]["content"])
        insights = result.get("insights")
        if not isinstance(insights, list) or not insights:
            raise ValueError("NVIDIA response has no insights")
        default_title = "Consejo para hoy" if lang == "es" else "Today's tip"
        default_message = "Revisa tus movimientos para mantener tu plan." if lang == "es" else "Check your transactions to stay on plan."
        default_action = "Ver detalles" if lang == "es" else "View details"
        sanitized = []
        for index, item in enumerate(insights[:3]):
            if not isinstance(item, dict):
                continue
            sanitized.append({"id": str(item.get("id") or f"insight-{index}"), "priority": item.get("priority") if item.get("priority") in ("success", "info", "warning") else "info", "icon": str(item.get("icon") or "lightbulb"), "title": str(item.get("title") or default_title)[:80], "message": str(item.get("message") or default_message)[:240], "action": str(item.get("action") or default_action)[:48]})
        if not sanitized:
            raise ValueError("NVIDIA insights were invalid")
        return {"summary": str(result.get("summary") or sanitized[0]["message"])[:240], "insights": sanitized, "generated_by": "nvidia-recommendations", "snapshot": snapshot}
    except (requests.RequestException, KeyError, ValueError, TypeError, json.JSONDecodeError):
        return fallback


async def _proactive_brief(session: AsyncSession, user_id: int, profile: ProfileRecord | None, fixed_expenses: list[FixedExpenseRecord], transactions: list[TransactionRecord], today: date, tz: ZoneInfo, lang: str = "en") -> dict:
    snapshot = _proactive_snapshot(profile, fixed_expenses, transactions, today, tz)
    # Provider settings and language participate in the cache key. A new
    # recommendation model, rotated key, or language switch should take
    # effect on the next dashboard visit, instead of leaving a prior/wrong-
    # language brief cached for up to six hours.
    provider_config = _nvidia_recommendations_config()
    provider_identity = {
        "model": provider_config["model"] if provider_config else "not-configured",
        "key_fingerprint": hashlib.sha256(provider_config["api_key"].encode()).hexdigest()[:12] if provider_config else "none",
    }
    signature = hashlib.sha256(json.dumps({"snapshot": snapshot, "provider": provider_identity, "lang": lang}, sort_keys=True).encode()).hexdigest()
    record = await session.scalar(select(ProactiveInsightRecord).where(ProactiveInsightRecord.user_id == user_id))
    now = datetime.now(timezone.utc)
    is_fresh = record is not None and record.data_signature == signature and _to_utc(record.generated_at) >= now - timedelta(hours=PROACTIVE_INSIGHT_REFRESH_HOURS)
    if is_fresh:
        return record.payload_json
    brief = _nvidia_proactive_brief(snapshot, lang)
    if record is None:
        session.add(ProactiveInsightRecord(user_id=user_id, data_signature=signature, payload_json=brief, generated_at=now))
    else:
        record.data_signature, record.payload_json, record.generated_at = signature, brief, now
    await session.commit()
    return brief


@app.on_event("shutdown")
async def shutdown() -> None:
    await engine.dispose()


@app.get("/api/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.post("/api/onboarding")
async def create_onboarding(data: OnboardingProfile, x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone")):
    if data.currency not in CURRENCIES:
        raise HTTPException(422, "Unsupported currency")
    tz = _resolve_timezone(x_timezone)
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        profile = await _profile(session, user.id)
        if profile is None:
            profile = ProfileRecord(user_id=user.id, ingreso=data.ingreso, ahorro_pct=data.ahorro_pct, currency=data.currency)
            session.add(profile)
            await session.flush()
        else:
            profile.ingreso, profile.ahorro_pct, profile.currency = data.ingreso, data.ahorro_pct, data.currency
            await session.execute(FixedExpenseRecord.__table__.delete().where(FixedExpenseRecord.profile_id == profile.id))
        session.add_all([FixedExpenseRecord(profile_id=profile.id, name=item.name, day=item.day, varies=item.varies, amount=item.amount) for item in data.gastos_fijos])
        await session.commit()
        fixed = await _fixed_expenses(session, profile)
        score, _ = await _record_trust_score(session, user.id, profile, fixed, await _transactions(session, user.id), datetime.now(tz).date(), tz)
        return {"ok": True, "trust_score": score}


@app.get("/api/profile")
async def get_profile(x_session_id: str | None = Header(default=None, alias="X-Session-Id")):
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        profile = await _profile(session, user.id)
        if profile is None:
            return {"ingreso": 0.0, "gastos_fijos": [], "ahorro_pct": 20.0, "currency": "PEN"}
        fixed = await _fixed_expenses(session, profile)
        return {"ingreso": float(profile.ingreso), "gastos_fijos": [{"name": expense.name, "day": expense.day, "varies": expense.varies, "amount": float(expense.amount) if expense.amount is not None else None} for expense in fixed], "ahorro_pct": float(profile.ahorro_pct), "currency": profile.currency}


@app.get("/api/dashboard")
async def get_dashboard(x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone"), x_language: str | None = Header(default=None, alias="X-Language")):
    tz = _resolve_timezone(x_timezone)
    lang = _resolve_language(x_language)
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        today = datetime.now(tz).date()
        profile, transactions = await _profile(session, user.id), await _transactions(session, user.id)
        fixed = await _fixed_expenses(session, profile)
        score, breakdown = await _record_trust_score(session, user.id, profile, fixed, transactions, today, tz)
        incomes = sum(float(tx.amount) for tx in transactions if tx.amount > 0)
        expenses = sum(-float(tx.amount) for tx in transactions if tx.amount < 0)
        fixed_data = []
        for expense in fixed:
            status, _ = _fixed_status(expense, transactions, today, tz)
            fixed_data.append({"name": expense.name, "day": expense.day, "varies": expense.varies, "amount": float(expense.amount) if expense.amount is not None else None, "status": status, "icon": _icon_for_expense_name(expense.name)})
        budget = _daily_budget(profile, fixed, transactions, today, tz)
        brief = await _proactive_brief(session, user.id, profile, fixed, transactions, today, tz, lang)
        return {"trust_score": {"value": score, "max": 20, "label": _trust_score_label(score, 20, lang), "breakdown": breakdown}, "balance": {"ingresos": round(incomes, 2), "gastos": round(expenses, 2), "meta_ahorro_pct": float(profile.ahorro_pct) if profile else 20.0}, "currency": profile.currency if profile else "PEN", "ai_insight": brief["summary"], "proactive_brief": brief, "recent": [_serialize_transaction(tx, tz, lang) for tx in transactions[:3]], "missing_data": [{"id": tx.id, "title": tx.title} for tx in transactions if tx.amount < 0 and not (tx.receipt_path or tx.receipt_url)], "fixed_expenses": fixed_data, "safety_cushion_days": _safety_cushion(transactions, today, tz), "daily_budget": {key: budget[key] for key in ("spent", "remaining", "limit_pct", "income_recorded", "is_available")}}


@app.get("/api/assistant/brief")
async def get_proactive_brief(x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone"), x_language: str | None = Header(default=None, alias="X-Language")):
    """Personalized assistant guidance, refreshed after six hours or new data."""
    tz = _resolve_timezone(x_timezone)
    lang = _resolve_language(x_language)
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        today = datetime.now(tz).date()
        profile = await _profile(session, user.id)
        transactions = await _transactions(session, user.id)
        fixed = await _fixed_expenses(session, profile)
        return await _proactive_brief(session, user.id, profile, fixed, transactions, today, tz, lang)


def _apply_filters(transactions: list[TransactionRecord], category: str | None, kind: str | None, month: str | None, evidence: str | None, tz: ZoneInfo) -> list[TransactionRecord]:
    result = transactions
    if category:
        result = [tx for tx in result if tx.category.lower() == category.lower()]
    if kind == "income": result = [tx for tx in result if tx.amount > 0]
    elif kind == "expense": result = [tx for tx in result if tx.amount < 0]
    if month:
        if not re.fullmatch(r"\d{4}-\d{2}", month): raise HTTPException(422, "month must be in YYYY-MM format")
        result = [tx for tx in result if _localize(tx.tx_date, tz).strftime("%Y-%m") == month]
    if evidence == "with": result = [tx for tx in result if tx.receipt_path or tx.receipt_url]
    elif evidence == "without": result = [tx for tx in result if not (tx.receipt_path or tx.receipt_url)]
    elif evidence: raise HTTPException(422, "evidence must be with or without")
    return result


@app.get("/api/transactions")
async def list_transactions(category: str | None = None, kind: str | None = None, month: str | None = None, evidence: str | None = None, x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone"), x_language: str | None = Header(default=None, alias="X-Language")):
    tz = _resolve_timezone(x_timezone)
    lang = _resolve_language(x_language)
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        profile = await _profile(session, user.id)
        result = _apply_filters(await _transactions(session, user.id), category, kind, month, evidence, tz)
        # Preserve legacy api.ts behavior: `total` is global, not filtered.
        return {"transactions": [_serialize_transaction(tx, tz, lang) for tx in result], "total": len(await _transactions(session, user.id)), "currency": profile.currency if profile else "PEN"}


@app.post("/api/transactions")
async def add_transaction(data: NewTransaction, x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone"), x_language: str | None = Header(default=None, alias="X-Language")):
    tz = _resolve_timezone(x_timezone)
    lang = _resolve_language(x_language)
    _require_receipt_for_expense(data.amount, data.receipt_url)
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        receipt_path, receipt_content_type, receipt_status = await _store_receipt(user.id, data.receipt_url)
        tx = TransactionRecord(user_id=user.id, title=data.title, category=data.category, amount=data.amount, icon=data.icon, completed=bool(receipt_path), receipt_path=receipt_path, receipt_status=receipt_status, receipt_content_type=receipt_content_type)
        session.add(tx)
        try:
            await session.commit()
            await session.refresh(tx)
        except Exception:
            await session.rollback()
            if receipt_path and receipt_storage:
                await receipt_storage.delete(receipt_path)
            raise
        return _serialize_transaction(tx, tz, lang)


@app.patch("/api/transactions/{transaction_id}")
async def update_transaction(transaction_id: int, data: UpdateTransaction, x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone"), x_language: str | None = Header(default=None, alias="X-Language")):
    tz = _resolve_timezone(x_timezone)
    lang = _resolve_language(x_language)
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        tx = await session.get(TransactionRecord, transaction_id)
        if tx is None or tx.user_id != user.id: raise HTTPException(404, "Transaction not found" if lang != "es" else "Transacción no encontrada")
        values = data.model_dump(exclude_unset=True)
        proposed_amount = float(values.get("amount", tx.amount))
        supplied_receipt = values.pop("receipt_url", None) if "receipt_url" in values else None
        has_existing_receipt = bool(tx.receipt_path or tx.receipt_url)
        _require_receipt_for_expense(proposed_amount, supplied_receipt if supplied_receipt is not None else "existing" if has_existing_receipt else None)
        old_receipt_path = tx.receipt_path
        new_receipt_path: str | None = None
        if supplied_receipt is not None:
            new_receipt_path, receipt_content_type, receipt_status = await _store_receipt(user.id, supplied_receipt)
            tx.receipt_path = new_receipt_path
            tx.receipt_url = None
            tx.receipt_content_type = receipt_content_type
            tx.receipt_status = receipt_status
        if "date" in values: tx.tx_date = _parse_transaction_date(values.pop("date"))
        for key, value in values.items(): setattr(tx, key, value)
        tx.completed = bool(tx.receipt_path or tx.receipt_url)
        try:
            await session.commit()
            await session.refresh(tx)
        except Exception:
            await session.rollback()
            if new_receipt_path and receipt_storage:
                await receipt_storage.delete(new_receipt_path)
            raise
        if new_receipt_path and old_receipt_path and receipt_storage:
            await receipt_storage.delete(old_receipt_path)
        return _serialize_transaction(tx, tz, lang)


@app.delete("/api/transactions/{transaction_id}")
async def delete_transaction(transaction_id: int, x_session_id: str | None = Header(default=None, alias="X-Session-Id")):
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        tx = await session.get(TransactionRecord, transaction_id)
        if tx is None or tx.user_id != user.id: raise HTTPException(404, "Transaction not found")
        receipt_path = tx.receipt_path
        await session.delete(tx)
        await session.commit()
        if receipt_path and receipt_storage:
            await receipt_storage.delete(receipt_path)
        return {"ok": True}


@app.get("/api/receipts/{transaction_id}")
async def get_receipt(transaction_id: int, token: str):
    """Streams a private receipt after validating a short-lived, scoped URL."""
    async with SessionLocal() as session:
        tx = await session.get(TransactionRecord, transaction_id)
        if tx is None or not tx.receipt_path or not _valid_receipt_access_token(token, tx.user_id, tx.id):
            raise HTTPException(404, "Receipt not found")
        if receipt_storage is None:
            raise HTTPException(503, "Receipt storage is not configured.")
        try:
            content = await receipt_storage.download(tx.receipt_path)
        except ReceiptStorageError as error:
            raise HTTPException(503, str(error)) from error
        return Response(content=content, media_type=tx.receipt_content_type or "image/jpeg", headers={"Cache-Control": "private, max-age=300"})


@app.get("/api/alerts")
async def alerts(x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone")):
    tz = _resolve_timezone(x_timezone)
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        today, profile, transactions = datetime.now(tz).date(), await _profile(session, user.id), await _transactions(session, user.id)
        fixed = await _fixed_expenses(session, profile)
        return {"variable_expenses_missing_amount": [{"fixed_expense_id": expense.id, "name": expense.name, "month": today.strftime("%Y-%m")} for expense in fixed if expense.varies and expense.amount is None], "transactions_missing_receipt": [{"id": tx.id, "title": tx.title, "amount": float(tx.amount), "date": _localize(tx.tx_date, tz).date().isoformat()} for tx in transactions if tx.amount < 0 and not (tx.receipt_path or tx.receipt_url)]}


@app.get("/api/transactions/export")
async def export_transactions(category: str | None = None, kind: str | None = None, month: str | None = None, evidence: str | None = None, x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone")):
    tz = _resolve_timezone(x_timezone)
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        today, profile, transactions = datetime.now(tz).date(), await _profile(session, user.id), await _transactions(session, user.id)
        fixed = {item.id: item for item in await _fixed_expenses(session, profile)}
        rows = []
        for tx in _apply_filters(transactions, category, kind, month, evidence, tz):
            fixed_status = ""
            if tx.fixed_expense_id and tx.fixed_expense_id in fixed: fixed_status = _fixed_status(fixed[tx.fixed_expense_id], transactions, today, tz)[0]
            rows.append({"id": tx.id, "fecha": _localize(tx.tx_date, tz).strftime("%Y-%m-%d %H:%M"), "titulo": tx.title, "categoria": tx.category, "tipo": "Ingreso" if tx.amount >= 0 else "Egreso", "monto": round(abs(float(tx.amount)), 2), "moneda": profile.currency if profile else "PEN", "tiene_comprobante": "Sí" if (tx.receipt_path or tx.receipt_url) else "No", "estado_gasto_fijo": fixed_status})
        content = pd.DataFrame(rows, columns=["id", "fecha", "titulo", "categoria", "tipo", "monto", "moneda", "tiene_comprobante", "estado_gasto_fijo"]).to_csv(index=False)
        return Response(content=content, media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="confia_historial.csv"'})


@app.get("/api/analytics")
async def get_analytics(x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone")):
    tz = _resolve_timezone(x_timezone)
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        today, profile, transactions = datetime.now(tz).date(), await _profile(session, user.id), await _transactions(session, user.id)
        fixed = await _fixed_expenses(session, profile)
        score, _ = await _record_trust_score(session, user.id, profile, fixed, transactions, today, tz)
        history = list((await session.scalars(select(TrustScoreHistory).where(TrustScoreHistory.user_id == user.id, TrustScoreHistory.date >= today - timedelta(days=29)).order_by(TrustScoreHistory.date))).all())
        history_by_date = {entry.date: float(entry.value) for entry in history}
        trend = [history_by_date.get(today - timedelta(days=offset), 0) for offset in range(29, -1, -1)]
        monthly = _month_transactions(transactions, today, tz)
        expense_by_category: dict[str, float] = {}
        for tx in monthly:
            if tx.amount < 0: expense_by_category[tx.category] = expense_by_category.get(tx.category, 0) - float(tx.amount)
        ordered = sorted(expense_by_category.items(), key=lambda item: item[1], reverse=True)
        if len(ordered) > 3: ordered = ordered[:3] + [("Otros", sum(amount for _, amount in ordered[3:]))]
        total_expense = sum(expense_by_category.values())
        top = [{"name": name, "pct": round(amount / total_expense * 100) if total_expense else 0, "amount": round(amount, 2), "color": _CHART_COLORS[index % len(_CHART_COLORS)]} for index, (name, amount) in enumerate(ordered)]
        today_spent = sum(-float(tx.amount) for tx in monthly if tx.amount < 0 and _localize(tx.tx_date, tz).date() == today)
        yesterday = today - timedelta(days=1)
        yesterday_spent = sum(-float(tx.amount) for tx in transactions if tx.amount < 0 and _localize(tx.tx_date, tz).date() == yesterday)
        treats = [tx for tx in monthly if tx.amount < 0 and abs(float(tx.amount)) < GASTOS_HORMIGA_THRESHOLD and tx.category in ("Alimentación", "Ocio")]
        treats_amount = round(sum(-float(tx.amount) for tx in treats), 2)
        budget = _daily_budget(profile, fixed, transactions, today, tz)
        total_income = sum(float(tx.amount) for tx in monthly if tx.amount > 0)
        brief = await _proactive_brief(session, user.id, profile, fixed, transactions, today, tz)
        return {"tranquility_trend": trend, "score_today": score * 50, "currency": profile.currency if profile else "PEN", "spend_pace": {"today": round(today_spent, 2), "yesterday_same_day": round(yesterday_spent, 2)}, "top_categories": top, "income_vs_expense": {"ingresos": round(total_income, 2), "gastos": round(total_expense, 2)}, "small_treats": {"amount": treats_amount, "equivalent": f"{round(treats_amount / 40)} suscripciones de streaming" if treats_amount else "Sin gastos hormiga detectados"}, "safety_cushion_days": _safety_cushion(transactions, today, tz), "daily_budget": {key: budget[key] for key in ("spent", "remaining", "limit_pct", "income_recorded", "is_available")}, "ai_advice": brief["summary"]}


@app.get("/api/analytics/historical")
async def analytics_historical(months: int = 5, x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone")):
    months = max(1, min(months, 60))
    tz = _resolve_timezone(x_timezone)
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        transactions, today = await _transactions(session, user.id), datetime.now(tz).date()
        result = []
        for offset in range(months - 1, -1, -1):
            anchor = (today.replace(day=1) - timedelta(days=offset * 28)).replace(day=1)
            while anchor.month != ((today.month - offset - 1) % 12) + 1: anchor -= timedelta(days=1); anchor = anchor.replace(day=1)
            total = sum(-float(tx.amount) for tx in _month_transactions(transactions, anchor, tz) if tx.amount < 0)
            result.append({"label": anchor.strftime("%b %Y"), "total_gastos": round(total, 2)})
        return {"months": result}


@app.get("/api/analytics/daily-pace")
async def analytics_daily_pace(month: str | None = None, x_session_id: str | None = Header(default=None, alias="X-Session-Id"), x_timezone: str | None = Header(default=None, alias="X-Timezone")):
    tz = _resolve_timezone(x_timezone)
    target = datetime.now(tz).date()
    if month:
        try: target = datetime.strptime(month, "%Y-%m").date()
        except ValueError: raise HTTPException(422, "month must be in YYYY-MM format")
    async with SessionLocal() as session:
        user = await _resolve_user(session, x_session_id)
        transactions = _month_transactions(await _transactions(session, user.id), target, tz)
        cumulative = 0.0; days = []
        for day in range(1, calendar.monthrange(target.year, target.month)[1] + 1):
            cumulative += sum(-float(tx.amount) for tx in transactions if tx.amount < 0 and _localize(tx.tx_date, tz).date().day == day)
            days.append({"day": day, "cumulative_spend": round(cumulative, 2)})
        return {"days": days}


def _parse_ai_json(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.IGNORECASE)
    return json.loads(content)


def _fallback_ai_chat(message: str) -> dict:
    """Mantiene el registro conversacional disponible cuando NIM no responde."""
    normalized = message.lower()
    amount_match = re.search(r"(?:s/|\$)?\s*(\d+(?:[.,]\d{1,2})?)", normalized)
    amount = float(amount_match.group(1).replace(",", ".")) if amount_match else 0.0
    is_income = any(word in normalized for word in ("gané", "gane", "ingreso", "recib", "deposit", "salario", "sueldo", "trabajo", "cobr"))
    category_keywords = {
        "Transporte": ("transporte", "taxi", "bus", "uber", "gasolina"),
        "Alimentación": ("comida", "supermercado", "restaurante", "café", "cafe", "galleta", "galletas", "pan", "snack"),
        "Ocio": ("ocio", "cine", "salida", "entretenimiento"),
        "Servicios": ("luz", "agua", "internet", "netflix", "servicio"),
        "Salario": ("salario", "sueldo", "trabajo", "planilla"),
    }
    category = next(
        (name for name, keywords in category_keywords.items() if any(word in normalized for word in keywords)),
        "Salario" if is_income else "Otros",
    )
    detected_type = "income" if is_income else "expense"
    if amount:
        kind = "ingreso" if is_income else "gasto"
        reply = f"Detecté un {kind} de ${amount:.2f} en {category}. ¿Quieres que lo registre?"
    else:
        reply = "No identifiqué un monto. Cuéntame cuánto fue para poder registrarlo."
    return {
        "reply": reply,
        "detected_category": category,
        "detected_amount": amount,
        "detected_type": detected_type,
    }


@app.post("/api/ai-chat")
def ai_chat(msg: ChatMessage):
    missing = [key for key in ("NVIDIA_API_KEY", "NVIDIA_INVOKE_URL", "NVIDIA_MODEL") if not os.environ.get(key)]
    if missing:
        # Registration should remain instant and usable in demo/local setups.
        return _fallback_ai_chat(msg.message)
    user_message = """Eres confIA, un copiloto financiero peruano. Extrae el movimiento del texto del usuario y responde ÚNICAMENTE JSON válido, sin markdown, exactamente con: {\"reply\": string, \"detected_category\": string, \"detected_amount\": number, \"detected_type\": \"income\"|\"expense\"}. Categoría debe ser una de Transporte, Alimentación, Ocio, Servicios, Salario u Otros. Si no hay monto, usa 0. detected_type debe ser income sólo si es un ingreso. reply debe ser breve, claro y pedir confirmación cuando haya monto. Texto del usuario: """ + msg.message
    headers = {"Authorization": f"Bearer {os.environ['NVIDIA_API_KEY']}", "Accept": "application/json"}
    payload = {"model": os.environ["NVIDIA_MODEL"], "messages": [{"role": "user", "content": user_message}], "temperature": 0, "top_p": 0.9, "max_tokens": 300, "stream": False}
    try:
        response = requests.post(
            os.environ["NVIDIA_INVOKE_URL"],
            headers=headers,
            json=payload,
            timeout=(2, 6),
        )
        response.raise_for_status()
        data = response.json()
        parsed = _parse_ai_json(data["choices"][0]["message"]["content"])
    except (requests.RequestException, KeyError, ValueError, TypeError, json.JSONDecodeError):
        # NVIDIA NIM is still the primary extraction provider. This fallback is
        # deliberately limited to unavailable/invalid provider responses so a
        # user can continue registering a movement instead of waiting forever.
        return _fallback_ai_chat(msg.message)
    detected_type = parsed.get("detected_type") if parsed.get("detected_type") in ("income", "expense") else "expense"
    category = parsed.get("detected_category") if parsed.get("detected_category") in RECEIPT_CATEGORIES else "Otros"
    return {"reply": str(parsed.get("reply") or "¿Quieres que lo registre?"), "detected_category": category, "detected_amount": float(parsed.get("detected_amount") or 0), "detected_type": detected_type}


@app.post("/api/receipt-scan")
def receipt_scan(req: ReceiptScanRequest):
    missing = [key for key in ("NVIDIA_API_KEY", "NVIDIA_INVOKE_URL") if not os.environ.get(key)]
    if missing:
        raise HTTPException(503, detail=f"Missing required NVIDIA variables: {', '.join(missing)}")
    prompt = "Eres un asistente que lee boletas y recibos de compra en imágenes. Analiza la imagen y responde ÚNICAMENTE JSON válido, sin markdown: {\"title\": string, \"category\": string, \"amount\": number, \"type\": \"income\" | \"expense\", \"merchant\": string, \"date\": string}. category debe ser exactamente una de: " + ", ".join(RECEIPT_CATEGORIES) + ". amount debe ser el monto total. date debe ser la fecha visible del comprobante en formato DD/MM/YYYY o una cadena vacía si no se lee con confianza. Si no puedes leer la imagen con confianza, usa amount: 0."
    try:
        response = requests.post(
            os.environ["NVIDIA_INVOKE_URL"],
            headers={"Authorization": f"Bearer {os.environ['NVIDIA_API_KEY']}", "Accept": "application/json"},
            json={"model": _NVIDIA_RECEIPT_MODEL, "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": req.image}}]}], "temperature": 0, "top_p": 0.9, "max_tokens": 300, "stream": False},
            timeout=(3, 30),
        )
        response.raise_for_status()
        data = _parse_ai_json(response.json()["choices"][0]["message"]["content"])
    except (requests.RequestException, KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(502, detail=f"Could not analyze the image with NVIDIA: {exc}") from exc
    return {"title": data.get("title") or data.get("merchant") or "Gasto detectado", "category": data.get("category") if data.get("category") in RECEIPT_CATEGORIES else "Otros", "amount": float(data.get("amount") or 0), "type": data.get("type") if data.get("type") in ("income", "expense") else "expense", "date": str(data.get("date") or "").strip()}


def main():
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
