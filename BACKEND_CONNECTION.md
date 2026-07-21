# BACKEND_CONNECTION.md — confIA Frontend↔Backend Connection Contract

## 1. Purpose

This document is the **authoritative connection contract** between the Next.js frontend (`frontend/`) and the FastAPI backend (`main.py`) for confIA. It exists so Codex can build out the **real, production-grade backend core** — persistence in PostgreSQL, a real daily-limit engine, a weighted Trust Score algorithm, an alerts/action-center, analytics aggregations (including "gastos hormiga" detection), and CSV export — while guaranteeing that every endpoint and JSON field the frontend already calls through `frontend/lib/api.ts` keeps working exactly as-is. `frontend/lib/api.ts` is the **source of truth**: it is the finished, working client and must not be treated as negotiable. Where the user's 5-module spec conflicts with what `api.ts`/`main.py` already implement, this document explicitly flags the discrepancy and resolves it in favor of `api.ts`.

## 2. Current State vs Target State (per module)

| Module | Implemented today in `main.py` | Missing / to build | Priority |
|---|---|---|---|
| **1. Onboarding & Baseline Config** | `POST /api/onboarding` accepts `{ingreso, gastos_fijos, ahorro_pct}`, stores in a single global `profile` variable (in-memory, one user only), returns a crude `trust_score = min(20, ahorro_pct/100*20)`. `GET /api/profile` returns it (or zeroed defaults if none). | Persist to PostgreSQL (`users`/`profile` table). Generate a real user id on first onboarding call. Initialize per-month calculation state (current month's daily limit, trust score baseline) at onboarding time, not just at dashboard read time. | High |
| **2. Home / Alert Center** | `GET /api/dashboard` computes `ingresos`/`gastos` from in-memory transactions, hardcodes `trust_value=15/20`, hardcodes `safety_cushion_days=45` and `daily_budget` (`spent`/`remaining`/`limit_pct` all hardcoded), computes `missing_data` from `completed=false` transactions, computes `fixed_expenses` status by fuzzy name-matching against transaction titles (no real date-vs-due-day comparison). | Real Daily Ideal Limit engine (formula in §5), real Colchón de Seguridad formula, real weighted Trust Score, fixed-expense status via actual due-day vs current-date comparison (not name matching alone), a proper Action Center endpoint distinguishing "gasto variable sin monto" vs "gasto sin comprobante" alerts. | High |
| **3. Conversational Hub (AI data entry)** | `POST /api/ai-chat` is fully **simulated**: keyword/regex based amount+category+income detection, canned reply templates — no LLM call. `POST /api/receipt-scan` **is real**: calls OpenAI `gpt-4o-mini` vision, returns structured `{title, category, amount, type}`. `POST /api/transactions` persists (in-memory) the confirmed transaction, decoupled from the chat/scan endpoints (frontend calls them separately). | Replace simulated `/api/ai-chat` NLP with a real LLM call (text-only, same JSON-extraction contract) if truly in scope; persist confirmed transactions to Postgres with `receipt_url`/`has_receipt` audit fields; keep human-in-the-loop confirm step exactly as `api.ts` expects (`addTransaction` is a separate call from `aiChat`/`scanReceipt`). | Medium |
| **4. Analytics Center** | `GET /api/analytics` computes `top_categories` for real from in-memory transactions (GROUP BY-style reduce, top 6 not top 3+"Otros"). `tranquility_trend`, `score_today`, `spend_pace`, `small_treats` are all **hardcoded placeholders**. No 5-month historical bar chart, no daily cumulative pace chart, no real "gastos hormiga" detector. | Real 30-day Trust Score/budget-compliance trend, real 5-month historical comparison (expandable to full history), Top 3 + "Otros" category grouping (currently top 6, no "Otros" bucket — discrepancy, see §6), real Gastos Hormiga detector (threshold + category list, §5), real cumulative daily spend-pace series. | Medium |
| **5. Historial (Ledger)** | `GET /api/transactions` supports `category`/`kind` filters only. `PATCH`/`DELETE /api/transactions/{id}` work in-memory. No month filter, no evidence-status filter, no CSV export, no recalculation trigger on edit/delete. | Add `month` and `evidence` (has/missing proof) filters, audit icon logic (`completed`/receipt URL presence), CSV export endpoint (pandas), and recalculation of Daily Limit + Trust Score triggered on every transaction create/update/delete. | High |

## 3. Architecture Overview

### 3.1 Ports & CORS
- Frontend dev server: `http://localhost:3000` (`npm run dev`, Next.js App Router).
- Backend: `http://localhost:8000` (`uv run uvicorn main:app --reload --port 8000`).
- `frontend/lib/api.ts` resolves the backend base URL from `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"` — **do not rename this env var**.
- CORS middleware (already present in `main.py`) must keep allowing the frontend origin. Make the allowed origin(s) configurable via a `CORS_ORIGINS` env var (comma-separated) instead of a hardcoded `["http://localhost:3000"]`, defaulting to that same value for local dev.

### 3.2 Data layer — migration path (in-memory dict → PostgreSQL)

Current state: `profile: OnboardingProfile | None` (single global) and `transactions: list[Transaction]` (single global list) — no DB, no multi-user, reset on every server restart.

Proposed schema (single-user assumption preserved per §8 — no auth yet, but modeled with a `user_id` FK from day one so multi-user is a additive migration later, not a rewrite):

```sql
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ingreso         NUMERIC(12,2) NOT NULL,
    ahorro_pct      NUMERIC(5,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fixed_expenses (
    id              SERIAL PRIMARY KEY,
    profile_id      INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    day             TEXT,               -- due day, e.g. "5" or "2026-07-05"; keep as TEXT to match current api.ts FixedExpense.day: string|null
    varies          BOOLEAN NOT NULL DEFAULT false,
    amount          NUMERIC(12,2),      -- nullable when varies=true
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    category         TEXT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,     -- negative = expense, positive = income
    tx_date         TIMESTAMPTZ NOT NULL DEFAULT now(),
    icon            TEXT NOT NULL DEFAULT 'payments',
    completed       BOOLEAN NOT NULL DEFAULT true,   -- false = missing receipt/evidence
    receipt_url     TEXT,                             -- URL/path to stored receipt image, nullable
    fixed_expense_id INTEGER REFERENCES fixed_expenses(id) ON DELETE SET NULL, -- link tx to a fixed expense commitment when matched
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trust_score_history (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    value           NUMERIC(5,2) NOT NULL,   -- 0-100 or 0-20 scale, see §5.3
    max_value       NUMERIC(5,2) NOT NULL,
    breakdown_json  JSONB,                    -- {"comprobantes_pct":.., "limite_diario_pct":.., "pago_puntual_pct":..}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, date)
);
```

`date` presentation strings the frontend already renders as-is (`"Hoy, 10:45 AM"`, `"14 Oct, 2023"`, etc. — see current seed data) come from `Transaction.date: string`. Keep serializing `tx_date` to a human string on the way out to avoid changing `api.ts`'s `Transaction.date: string` type; do not switch it to raw ISO without frontend approval.

### 3.3 Environment variables

| Var | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Yes (for `/api/receipt-scan` vision only) | OpenAI SDK auth. Already loaded via `python-dotenv` `.env`. |
| `NVIDIA_API_KEY` | Yes (new — for `/api/ai-chat` real NLP) | Bearer token for NVIDIA NIM (`integrate.api.nvidia.com`). |
| `NVIDIA_INVOKE_URL` | Yes (new) | `https://integrate.api.nvidia.com/v1/chat/completions` — chat completions endpoint, OpenAI-compatible request/response shape. |
| `NVIDIA_MODEL` | Yes (new) | `minimaxai/minimax-m3` — model id sent in the request body. |
| `DATABASE_URL` | Yes (new) | Postgres connection string, e.g. `postgresql+asyncpg://user:pass@localhost:5432/confia`. |
| `CORS_ORIGINS` | Recommended (new) | Comma-separated list of allowed origins, default `http://localhost:3000`. |

**Provider split — do not confuse these two AI providers:**
- **OpenAI (`gpt-4o-mini`)** → `POST /api/receipt-scan` only (image/vision). Already implemented, do not touch.
- **NVIDIA NIM (`minimaxai/minimax-m3`)** → replaces the simulated `POST /api/ai-chat` (text-only chat, amount/category/type extraction). Call it exactly like the reference script the team validated:
  ```python
  import requests

  headers = {
      "Authorization": f"Bearer {os.environ['NVIDIA_API_KEY']}",
      "Accept": "application/json",
  }
  payload = {
      "model": os.environ["NVIDIA_MODEL"],
      "messages": [{"role": "user", "content": user_message}],
      "temperature": 1,
      "top_p": 0.95,
      "max_tokens": 8192,
      "stream": False,
  }
  response = requests.post(os.environ["NVIDIA_INVOKE_URL"], headers=headers, json=payload)
  response.raise_for_status()
  data = response.json()
  # data["choices"][0]["message"]["content"] holds the model's reply — parse/prompt it
  # to return the SAME JSON shape /api/ai-chat already returns to the frontend
  # (amount, category, type, reply text), so api.ts does not need to change.
  ```
  Keep `stream=False` (the frontend expects a single JSON response, not SSE) unless `frontend/lib/api.ts` is updated to consume a stream, which is out of scope here.

### 3.4 New backend dependencies

Checked `pyproject.toml`/no `uv.lock` present in this repo snapshot (dependencies list only, no lockfile found) — currently only: `fastapi`, `openai`, `pydantic`, `python-dotenv`, `uvicorn[standard]`. **None of the following are present yet**, all must be added:

```
sqlalchemy>=2.0        # ORM / Core, async engine support
asyncpg                # Postgres async driver (paired with SQLAlchemy async engine)
alembic                # schema migrations
pandas                 # CSV export for Historial (Module 5)
```

Add via `uv add sqlalchemy asyncpg alembic pandas`.

## 4. Full API Contract

Legend: ✅ existing (keep signature), 🔧 existing but needs real logic behind it, 🆕 new endpoint to build.

### 4.1 ✅ `GET /api/health`
- Module: infra.
- Response `200`: `{status: string, time: string (ISO 8601)}`.
- No changes needed.

### 4.2 🔧 `POST /api/onboarding` — Module 1
- Called from: `frontend/app/page.tsx` (`api.onboarding`), `frontend/app/ajustes/page.tsx` (also reuses `api.onboarding` to save edits).
- Request body:
```json
{ "ingreso": 3200.0, "gastos_fijos": [{"name": "Netflix", "day": "5", "varies": false, "amount": 45.9}], "ahorro_pct": 20.0 }
```
- Response `200`: `{"ok": true, "trust_score": 16}` — `trust_score` currently `int` 0–20, proportional to `ahorro_pct`. **Extend, do not replace**: on real persistence, this call must create/update the `profiles` row + replace the `fixed_expenses` rows for that user, and recompute the day's Trust Score using the real weighted algorithm (§5.3), still returned as this same `{ok, trust_score}` shape.
- Errors: `422` on validation failure (Pydantic default).

### 4.3 🔧 `GET /api/profile` — Module 1
- Called from: `frontend/app/ajustes/page.tsx`.
- Response `200`: `{"ingreso": 3200.0, "gastos_fijos": [...], "ahorro_pct": 20.0}` — if no profile exists yet, current code returns zeroed defaults (`ingreso: 0.0, gastos_fijos: [], ahorro_pct: 20.0`); keep that fallback behavior so Ajustes doesn't crash pre-onboarding.

### 4.4 🔧 `GET /api/dashboard` — Module 2
- Called from: `frontend/app/home/page.tsx`.
- Response `200` (exact shape from `api.ts` `DashboardData`):
```json
{
  "trust_score": {"value": 15, "max": 20, "label": "Saludable"},
  "balance": {"ingresos": 2400.0, "gastos": 293.84, "meta_ahorro_pct": 20.0},
  "ai_insight": "string",
  "recent": [ /* Transaction[], last 3 */ ],
  "missing_data": [{"id": 4, "title": "Supermercado Central"}],
  "fixed_expenses": [
    {"name": "Netflix", "day": "5", "varies": false, "amount": 45.9, "status": "pagado", "icon": "subscriptions"}
  ],
  "safety_cushion_days": 45,
  "daily_budget": {"spent": 52.0, "remaining": 35.0, "limit_pct": 60}
}
```
- Business logic to implement for real (was hardcoded/stubbed): `trust_score.value` from §5.3, `safety_cushion_days` from §5.2, `daily_budget` (`spent` = today's actual spend, `remaining` = today's Daily Ideal Limit minus spent, `limit_pct` = `spent/limit*100` capped at 100) from §5.1, `fixed_expenses[].status` from §5.4 (due-day comparison, not name-substring guessing alone — keep the name-match as the linking mechanism but drive status off dates).
- `label` thresholds (already implemented, keep as-is): `>=85% -> "Excelente"`, `>=60% -> "Saludable"`, `>=35% -> "Regular"`, else `"Necesita atención"`.

### 4.5 🆕 `GET /api/alerts` — Module 2 (Action Center)
- Not yet consumed by `api.ts` — **new addition**, additive only (does not replace `missing_data`/`fixed_expenses` already inside `/api/dashboard`, which the frontend already renders). Expose it as a dedicated endpoint so Codex can build a richer Action Center without bloating `/api/dashboard`; the frontend can adopt it later without breaking today's Home page.
- Response `200`:
```json
{
  "variable_expenses_missing_amount": [
    {"fixed_expense_id": 3, "name": "Luz", "month": "2026-07"}
  ],
  "transactions_missing_receipt": [
    {"id": 12, "title": "Restaurante", "amount": -42.15, "date": "2026-07-18"}
  ]
}
```

### 4.6 🆕 `GET /api/fixed-expenses/status` — Module 2
- Optional dedicated endpoint if Codex wants to decouple this from `/api/dashboard`; otherwise this logic already lives inline in `dashboard.fixed_expenses`. Not required by `api.ts` today — treat as internal/optional, do not make the frontend depend on it unless asked.

### 4.7 🔧 `GET /api/transactions?category=&kind=` — Module 5
- Called from: `frontend/app/historial/page.tsx` (`api.transactions({category, kind})`).
- Query params: `category?: string` (case-insensitive exact match today), `kind?: "income"|"expense"`.
- Response `200`: `{"transactions": [Transaction, ...], "total": 7}`. **Discrepancy note**: `total` currently returns the length of the *unfiltered* transaction list (`len(transactions)`), not the filtered result count — verify with the user/Codex whether `total` should reflect the filtered set or the global count before changing it, since `historial/page.tsx` may rely on either behavior; do not silently change without checking current frontend usage.
- **New (Module 5) filters to add, additively** — extend query params without removing the existing two: `month?: string` (e.g. `"2026-07"`), `evidence?: "with"|"without"` (has `receipt_url`/`completed=true` vs not).

### 4.8 ✅ `POST /api/transactions` — Module 3 & 5
- Called from: `frontend/app/ai-hub/page.tsx` (confirm button after chat/scan), also usable directly from Historial in principle.
- Request: `{title: string, category: string, amount: number, icon?: string}`.
- Response `201`-worthy but current code returns default `200` with the created `Transaction` (`id` auto-increment, `date="Hoy"`, `icon` defaults `"payments"`, `completed=true` by default). Keep this shape. On DB migration, persist real `tx_date=now()`, still serialize `date` as a human string for the frontend (see §3.2).
- **Recalculation requirement (Module 5)**: creating a transaction MUST trigger recomputation of `daily_budget`/Trust Score for the next `GET /api/dashboard` call (recompute-on-read is acceptable; a background recompute-on-write is also acceptable, but the *value returned* must reflect the new transaction immediately — no stale cache). The daily budget is based on income transactions recorded in the current month, never only on the planned income saved in the profile. If no income has been recorded, return zero with `is_available: false` so an empty account is never presented as funded.

### 4.9 ✅ `PATCH /api/transactions/{id}` — Module 5
- Called from: `frontend/components/EditTransactionModal.tsx` (via `historial/page.tsx`).
- Request: `Partial<{title, category, amount, date, icon, completed}>` — only provided fields update (`exclude_unset=True` semantics, already implemented).
- Response `200`: updated `Transaction`. `404` with `{"detail": "Transaction not found"}` if id doesn't exist.
- Same recalculation requirement as §4.8 applies (edits change amount/completed → must affect Daily Limit + Trust Score on next read).

### 4.10 ✅ `DELETE /api/transactions/{id}` — Module 5
- Called from: `frontend/app/historial/page.tsx` (`api.deleteTransaction`).
- Response `200`: `{"ok": true}`. `404` `{"detail": "Transaction not found"}` if missing.
- Same recalculation requirement applies.

### 4.11 🆕 `GET /api/transactions/export?category=&kind=&month=&evidence=` — Module 5
- Not in `api.ts` yet — new addition for the CSV exporter. Accept the same filters as §4.7 and return `text/csv` (via pandas `DataFrame.to_csv`).
- Response `200`, `Content-Type: text/csv`, `Content-Disposition: attachment; filename="confia_historial.csv"`.
- Columns (exact order): `id, fecha, titulo, categoria, tipo, monto, tiene_comprobante, estado_gasto_fijo` (last column null for non-fixed-expense-linked rows).

### 4.12 🔧 `GET /api/analytics` — Module 4
- Called from: `frontend/app/analitica/page.tsx`.
- Response `200` (exact `AnalyticsData` shape from `api.ts`):
```json
{
  "tranquility_trend": [35, 32, 25, 15, 20, 5, 10],
  "score_today": 840,
  "spend_pace": {"today": 24, "yesterday_same_day": 32},
  "top_categories": [{"name": "Alimentación", "pct": 45, "amount": 169.4, "color": "#6366f1"}],
  "income_vs_expense": {"ingresos": 2400.0, "gastos": 293.84},
  "small_treats": {"amount": 120, "equivalent": "3 suscripciones de streaming"},
  "safety_cushion_days": 45,
  "daily_budget": {"spent": 52.0, "remaining": 35.0, "limit_pct": 60},
  "ai_advice": "string"
}
```
- **Discrepancy to fix**: `tranquility_trend` currently hardcoded to 7 fixed numbers, but Module 4 spec asks for a **30-day** Trust Score/budget-compliance trend for a line chart. Since `api.ts` types this as `number[]` (untyped length), extending it to 30 points is **safe and backward compatible** — no frontend type change needed, just return more points (verify `analitica/page.tsx` renders however many points come back rather than assuming exactly 7).
- `top_categories` currently returns up to 6 categories sorted by amount, no "Otros" bucket. Module 4 spec wants **Top 3 + "Otros"** aggregate. Since `api.ts`'s type is `{name, pct, amount, color}[]` with no length constraint, change the grouping logic to emit exactly top 3 + one synthetic `{name: "Otros", pct, amount, color}` row when there are more than 3 categories — this is compatible with the existing type, no frontend change required.
- `small_treats` is the existing field name matching what the spec calls "Gastos Hormiga" — **do not rename this field**, `api.ts` already expects `small_treats: {amount, equivalent}`. Implement the real detector logic behind it (§5.5) while keeping the field name and shape.
- **New (Module 4), additive-only, not yet in `api.ts`** — if a 5-month bar chart and a cumulative daily-pace line are needed as separate payloads (rather than folded into existing fields), add:
  - 🆕 `GET /api/analytics/historical?months=5` → `{"months": [{"label": "Mar 2026", "total_gastos": 1200.5}, ...]}`
  - 🆕 `GET /api/analytics/daily-pace?month=2026-07` → `{"days": [{"day": 1, "cumulative_spend": 52.0}, ...]}`
  These are optional/extension-point endpoints — the frontend does not call them yet; add only if/when `analitica/page.tsx` is updated to consume them.

### 4.13 🔧 `POST /api/ai-chat` — Module 3
- Called from: `frontend/app/ai-hub/page.tsx`.
- Request: `{"message": "gasté 45 en transporte"}`.
- Response `200`: `{"reply": string, "detected_category": string, "detected_amount": number, "detected_type": "income"|"expense"}`.
- **Current implementation is fully simulated** (keyword list for categories/income, first numeric token as amount, canned reply templates from `_AI_RESPONSES`). This satisfies the *shape* of Module 3's "bidirectional chat" but not its "vision + NLP extraction pipeline" ambition for text. If real NLP is now in scope, replace the body of `ai_chat()` with an OpenAI chat-completions call (JSON mode, same prompt style as `receipt_scan`) returning the same 4 fields — **keep the response shape identical**, this is purely an internal implementation swap.
- This endpoint does **not** persist anything; the frontend calls `api.addTransaction(...)` separately after the user confirms (see `ai-hub/page.tsx` lines ~91, ~255). Keep that two-step flow (detect → confirm → persist) intact.

### 4.14 ✅ `POST /api/receipt-scan` — Module 3
- Called from: `frontend/app/ai-hub/page.tsx` (camera/gallery upload) and `frontend/components/EditTransactionModal.tsx` (re-scan on edit).
- Request: `{"image": "data:image/png;base64,...."}`.
- Response `200`: `{"title": string, "category": string, "amount": number, "type": "income"|"expense"}`.
- Already uses real `gpt-4o-mini` vision. `503` `{"detail": "..."}` if `OPENAI_API_KEY` missing. `502` `{"detail": "..."}` on OpenAI call failure. **No changes required** to this endpoint's contract; only add persistence of the resulting `receipt_url` (store the uploaded image, e.g. to disk/S3/base64-in-DB) once the transaction is confirmed via `POST /api/transactions`, so `transactions.receipt_url` and `completed`/audit-icon logic in Module 5 have something real to check.

## 5. Business Logic Specifications

### 5.1 Daily Ideal Limit (Límite Diario Ideal)

```
dias_restantes = last_day_of_month(today) - today.day + 1   # inclusive of today
limite_diario = (ingreso - suma(gastos_fijos.amount para no-variables) - meta_ahorro) / dias_restantes
```//
Where `meta_ahorro = ingreso * (ahorro_pct / 100)` if the goal is a percentage (current onboarding model uses `ahorro_pct`, a fixed-amount goal is not in the current schema — keep percentage-based to match `api.ts`).

Edge cases:
- **Day 1 of month**: `dias_restantes = total_days_in_month` (full month divisor) — no special-case needed, formula holds.
- **Last day of month**: `dias_restantes = 1` — limit equals whatever is left for that single day; if negative, clamp `daily_budget.remaining` to `0` in the response but keep the raw negative value available internally for the Trust Score penalty (do not silently hide overspend from the algorithm, only from the UI-facing "remaining" if the frontend can't render negatives — verify `home/page.tsx`'s progress bar tolerates negative values before deciding to clamp).
- **Variable gastos_fijos with `amount=null`**: excluded from the fixed-cost subtraction until the user supplies a monthly amount (this is exactly what the `/api/alerts` "variable expenses missing amount" alert is for in §4.5) — treat null-amount variable expenses as `0` in the formula until resolved, and surface the alert so the number doesn't silently ignore them forever.
- **Negative result** (fixed costs + savings goal exceed income): `limite_diario` can be negative — pass the true value through; `daily_budget.limit_pct` should be computed as `min(100, round(spent/limite_diario*100))` only when `limite_diario > 0`, otherwise report `limit_pct: 100` (already over budget) to avoid division by zero/negative percentages.

### 5.2 Colchón de Seguridad (Safety Cushion)

```
ahorro_historico_acumulado = suma de (ingresos - gastos) de todos los meses cerrados + superávit del mes actual hasta hoy
promedio_gasto_diario = suma(gastos del usuario en los últimos 30 días) / min(30, dias_con_datos)
colchon_dias = round(ahorro_historico_acumulado / promedio_gasto_diario) si promedio_gasto_diario > 0, si no 0
```
Current `main.py` hardcodes `safety_cushion_days: 45` — replace with this computation once historical monthly closes exist in `trust_score_history`/aggregated `transactions`. If there is no full month of history yet (new user), fall back to a `0`-based cushion rather than a hardcoded placeholder, and consider a UI-facing "not enough data yet" flag (extension point, optional — not in `api.ts` today, don't add a new required field, just clamp to `0`).

### 5.3 Trust Score (weighted algorithm)

Current `main.py` `/api/onboarding` stub: `trust_score = min(20, round(ahorro_pct/100*20))` (0–20 scale) — this is a placeholder, not the real algorithm; `/api/dashboard` hardcodes `trust_value=15/max=20` entirely, ignoring the onboarding computation. Both must be replaced by one consistent engine, kept on the existing `{value, max, label}` 0–20 scale so `api.ts`'s `DashboardData.trust_score: {value, max, label}` type is untouched.

Proposed weights (sum to `max=20`, matching the current scale so no frontend change is needed):

| Factor | Weight (points) | Measurement |
|---|---|---|
| Validación de comprobantes | 8 | `comprobantes_validados / total_transacciones_egreso_mes` (transactions with `completed=true`/`receipt_url` present) × 8 |
| Respeto del límite diario | 8 | `dias_dentro_del_limite / dias_transcurridos_del_mes` × 8 |
| Pago puntual de gastos fijos | 4 | `gastos_fijos_pagados_a_tiempo / total_gastos_fijos_del_mes` × 4 |

```
trust_value = round(
    8 * pct_comprobantes +
    8 * pct_limite_diario +
    4 * pct_pago_puntual
)
label = _trust_score_label(trust_value, 20)   # thresholds already implemented, unchanged
```
Persist one row per day into `trust_score_history` (`value`, `max_value=20`, `breakdown_json` with the three raw percentages) so the Module 2 "modal de desglose" can show the breakdown and Module 4's 30-day trend (§4.12) has real data to chart, instead of the current hardcoded `tranquility_trend` array.

### 5.4 Fixed-expense status (Pagado / Pendiente / Falta Comprobante)

Current logic (name-substring match against transaction titles) stays as the **linking** mechanism (or better: use `transactions.fixed_expense_id` FK once persisted, set at confirm-time when the user picks/confirms which fixed expense a transaction settles). Status derivation should become date-aware:

```
hoy = today()
fecha_cobro = parse day-of-month from fixed_expense.day  (e.g. "5" -> 5th of current month)

si no existe transacción vinculada:
    si hoy.day < fecha_cobro:  estado = "pendiente"
    si hoy.day >= fecha_cobro: estado = "pendiente"  (still pendiente, becomes overdue-visually but same enum — api.ts has no "vencido" state, don't invent one)
si existe transacción vinculada y transacción.completed == false:
    estado = "falta_comprobante"
si existe transacción vinculada y transacción.completed == true:
    estado = "pagado"
```
Keep the 3-value enum `"pagado"|"pendiente"|"falta_comprobante"` exactly as typed in `api.ts`'s `FixedExpenseStatus.status` — do not add a 4th state without a frontend change.

### 5.5 Gastos Hormiga detector

```
umbral = 20.0  (soles, configurable constant — not currently exposed as an env var, hardcode as a module constant, e.g. GASTOS_HORMIGA_THRESHOLD = 20.0)
categorias_alta_rotacion = ["Alimentación", "Ocio"]   # closest existing categories to "snacks/café" in the current RECEIPT_CATEGORIES list — there is no dedicated "Snacks"/"Café" category today; extend RECEIPT_CATEGORIES only if the user confirms new categories are wanted

gastos_hormiga = [t for t in transactions_del_mes
                   if t.amount < 0
                   and abs(t.amount) < umbral
                   and t.category in categorias_alta_rotacion]

small_treats.amount = round(sum(abs(t.amount) for t in gastos_hormiga), 2)
small_treats.equivalent = pick a human phrase, e.g. f"{round(amount/40)} suscripciones de streaming" (~40 soles reference price) or similar heuristic — keep the existing phrasing style from main.py's current hardcoded example.
```
Reuses the existing `AnalyticsData.small_treats: {amount, equivalent}` field — no shape change.

### 5.6 CSV export columns (Historial)

Exact column order and formatting for `GET /api/transactions/export`:

| Column | Source | Format |
|---|---|---|
| `id` | `transactions.id` | int |
| `fecha` | `transactions.tx_date` | `YYYY-MM-DD HH:MM` |
| `titulo` | `transactions.title` | string |
| `categoria` | `transactions.category` | string |
| `tipo` | derived from sign of `amount` | `"Ingreso"` / `"Egreso"` |
| `monto` | `abs(transactions.amount)` | 2-decimal float |
| `tiene_comprobante` | `transactions.completed` / `receipt_url is not null` | `"Sí"` / `"No"` |
| `estado_gasto_fijo` | joined from `fixed_expenses` status (§5.4) if linked | string or empty |

Build with pandas: `pd.DataFrame(rows).to_csv(index=False)`, streamed back with `Content-Type: text/csv`.

## 6. Frontend Contract Compatibility

**MUST NOT change public signature** (every function/type currently exported from `frontend/lib/api.ts`):
- `api.onboarding(data: {ingreso, gastos_fijos, ahorro_pct}) → {ok, trust_score}`
- `api.profile() → {ingreso, gastos_fijos, ahorro_pct}`
- `api.dashboard() → DashboardData` (all fields: `trust_score`, `balance`, `ai_insight`, `recent`, `missing_data`, `fixed_expenses`, `safety_cushion_days`, `daily_budget`)
- `api.transactions(params?: {category?, kind?}) → {transactions, total}`
- `api.addTransaction(data: {title, category, amount, icon?}) → Transaction`
- `api.deleteTransaction(id) → {ok}`
- `api.updateTransaction(id, data: Partial<{title, category, amount, date, icon, completed}>) → Transaction`
- `api.analytics() → AnalyticsData` (all fields: `tranquility_trend`, `score_today`, `spend_pace`, `top_categories`, `income_vs_expense`, `small_treats`, `safety_cushion_days`, `daily_budget`, `ai_advice`)
- `api.aiChat(message) → {reply, detected_category, detected_amount, detected_type}`
- `api.scanReceipt(image) → {title, category, amount, type}`
- Types `Transaction`, `FixedExpense`, `FixedExpenseStatus` — every field, every optionality mark (`?`/`| null`).

**Extension points** (new fields the frontend can optionally consume later, safe to add on the backend now without breaking anything, since none of these are read by current pages):
- Extra items in `tranquility_trend` (7 → 30 points).
- `top_categories` reshaped to top-3 + "Otros" (same array-of-objects shape, just different grouping — verify `analitica/page.tsx` doesn't hardcode "exactly N slices" before shipping).
- New standalone endpoints: `GET /api/alerts`, `GET /api/transactions/export`, `GET /api/analytics/historical`, `GET /api/analytics/daily-pace` — none are called by `api.ts` today; add the client functions only when a page is updated to use them.
- New query params `month`/`evidence` on `GET /api/transactions` — additive, existing calls without them keep working.

## 7. Migration Plan / Build Order

1. Add Postgres + SQLAlchemy + Alembic + pandas to `pyproject.toml`; set up `DATABASE_URL`; write the initial migration for the schema in §3.2.
2. Migrate `POST /api/onboarding` / `GET /api/profile` to read/write `profiles` + `fixed_expenses` tables instead of the global `profile` variable — keep response shapes identical.
3. Migrate `transactions` in-memory list to the `transactions` table. La instalación de producción debe iniciar sin registros de ejemplo; los primeros movimientos se crean únicamente mediante los flujos reales de la aplicación.
4. Implement the real Daily Ideal Limit + Colchón de Seguridad + Trust Score engine (§5.1–§5.3), wire into `GET /api/dashboard`, persist daily snapshots into `trust_score_history`.
5. Implement `GET /api/alerts` (Module 2 Action Center) reading from the new tables.
6. Implement real Analytics aggregations in `GET /api/analytics` (top-3+Otros, gastos hormiga via §5.5) and the optional `historical`/`daily-pace` endpoints.
7. Add CSV export endpoint (§5.6, §4.11) and the `month`/`evidence` filters on `GET /api/transactions`.
8. Wire `POST /api/ai-chat` to real NLP (optional, only if explicitly requested) and ensure `POST /api/receipt-scan` results, once confirmed via `POST /api/transactions`, persist `receipt_url` for audit-icon logic in Historial.
9. Add recalculation triggers: any create/update/delete on `transactions` must make the *next* `GET /api/dashboard` reflect updated Daily Limit + Trust Score (recompute-on-read is fine, no separate endpoint needed).

Each step should be independently testable against the running frontend without requiring frontend changes — verify via the existing manual flow (Onboarding → Home → AI Hub → Historial → Analítica → Ajustes) documented in `README.md`/`CODEX_PROMPT.md`.

## 8. Non-Goals / Out of Scope

- **Authentication / login / multi-user support.** The current system assumes a single implicit "Usuario" with no session/auth concept anywhere in `main.py` or the frontend. The proposed schema includes a `user_id` FK for future-proofing, but do NOT build login screens, JWT/session auth, or per-request user resolution now — create the implicit user on the first write.
- **Real bank/API integrations** (Plaid, Open Banking, etc.) — all transaction entry stays manual/chat/receipt-photo per Module 3, no automatic bank sync.
- **Push notifications / scheduled jobs** for the "medianoche" (midnight) recalculation trigger mentioned in Module 2 — implement Daily Limit recompute as recompute-on-read (lazy, on every `GET /api/dashboard` call), not as a cron/background job, unless explicitly requested later.
- **Logo file / branding assets** — already called out as pending in `README.md`, unrelated to backend work.
- **Renaming or removing any existing `main.py` endpoint or `api.ts` field** — every change here is additive or an internal-logic swap behind an unchanged public contract.
