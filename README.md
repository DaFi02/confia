# confIA — Yo confío, tú confIA

Personal-finance web app with an AI copilot, built from a design generated in **Google Stitch** and turned into a full product (frontend + backend + cloud deployment) during a hackathon.

**Live demo:** https://confia.dafi.dev

## What is this?

confIA is a financial copilot that helps someone:

- Set up their fixed income, a dynamic editable list of fixed expenses (with billing day and whether the amount varies month to month), a savings goal, and a display currency during onboarding.
- See their financial health at a glance (Home): a semicircular Trust Score gauge with a transparent, tap-to-expand breakdown, monthly balance, safety-cushion days, how much is left to spend today, alerts for missing receipts/amounts, "Monthly Commitments" status, and an AI-generated proactive brief with 2-3 personalized insights.
- Log a transaction by chatting with an AI in natural language, or by taking a photo of a receipt that a real vision model reads, extracts (merchant, amount, category, date), and shows in a structured "ready to audit" card before saving (AI Hub).
- Browse, filter (category/month/type/receipt status), edit — including re-scanning the receipt with AI — and delete every transaction (History).
- Understand spending habits with real charts: a 30-day trend line, a historical 5-month bar chart, a daily cumulative-spend line, and two donut charts (Income vs Expense, Top Categories) (Analytics).
- Edit their full financial profile any time, switch the interface language (English/Spanish), and pick a display currency from 28 options (Settings).

It's a **real, functional app**: data travels between the browser and a real backend with a Postgres database and private cloud storage — not static mockup images.

## Highlights beyond the original prototype

Built on top of the initial Codex-generated backend (see [`CODEX_PROMPT.md`](./CODEX_PROMPT.md) for the original brief), the app was hardened for a real multi-user, multi-timezone, multi-language deployment:

- **Per-visitor data isolation.** Every browser gets an anonymous UUID (`X-Session-Id`), so concurrent visitors never share a profile or transactions — no login required.
- **Visitor-local time.** The frontend sends the browser's IANA timezone (`X-Timezone`); the backend buckets "today", daily budgets, and trust score by *that* calendar day instead of the server's, which matters for a globally-distributed audience.
- **Bilingual UI (English default, Spanish selectable).** Static UI strings are translated client-side by a lightweight DOM-text translator (`LanguageProvider`); anything the backend generates with live data (dates, Trust Score labels, AI insights, error messages) is translated **server-side** via an `X-Language` header, since a client-side exact-match translator can never localize interpolated text.
- **28-currency display.** Users pick a display currency at onboarding; every amount across Home, History, Analytics, and AI Hub renders with the right symbol — this doesn't do FX conversion, it only changes how amounts are labeled.
- **Private receipt storage.** Receipt photos are uploaded to a private Google Cloud Storage bucket; Postgres only stores the object path, content type, and a short-lived HMAC-signed access token — the raw image is never stored in the database or exposed by a public URL.
- **AI-generated proactive insights, cached.** A dedicated NVIDIA NIM connection (separate from the chat/receipt models) produces a short financial brief, cached in the database and refreshed only when the underlying data changes or after 6 hours — not on every page load.
- **Deployed to Google Cloud Run** behind a custom domain (Cloudflare DNS, Google-managed TLS certificates) with Secret Manager-backed credentials.

## Architecture

```
algo/
├── main.py                # Backend (FastAPI) — REST API, SQLAlchemy models, business logic
├── receipt_storage.py      # Private Google Cloud Storage adapter for receipt photos
├── pyproject.toml          # Python dependencies (managed with uv)
├── alembic/                # Database migrations (PostgreSQL schema history)
├── Dockerfile               # Backend container image (Cloud Run contract: 0.0.0.0:$PORT)
├── DESIGN.md                # Design system + frontend/backend wiring guide
├── CODEX_PROMPT.md          # Original reference prompt with the initial API contract
├── stitch/                  # Original Google Stitch export (HTML + screenshots + DESIGN.md)
└── frontend/                 # Next.js app (React + TypeScript + Tailwind CSS v4)
    ├── app/
    │   ├── page.tsx            # Screen 1: Onboarding
    │   ├── home/page.tsx       # Screen 2: Home
    │   ├── ai-hub/page.tsx     # Screen 3: AI Hub (chat + receipt scan)
    │   ├── historial/page.tsx  # Screen 4: Transaction history
    │   ├── analitica/page.tsx  # Screen 5: Analytics Center
    │   ├── ajustes/page.tsx    # Screen 6: Settings / financial profile
    │   └── globals.css         # Design tokens (color, type, spacing) sourced from Stitch
    ├── components/
    │   ├── BottomNav.tsx              # Shared bottom navigation bar
    │   ├── DonutChart.tsx             # Donut charts used in Analytics
    │   ├── BarChart.tsx                # Historical bar chart used in Analytics
    │   ├── EditTransactionModal.tsx    # Edit/delete a transaction (with AI re-scan)
    │   ├── QuickAddModal.tsx           # Manual quick-add transaction modal
    │   ├── ProactiveBrief.tsx          # "Your financial assistant" AI insights panel
    │   ├── TrustScoreBreakdownModal.tsx # Trust Score algorithm breakdown
    │   ├── FixedExpensesEditor.tsx      # Dynamic fixed-expenses list editor
    │   └── LanguageProvider.tsx         # English/Spanish UI translation
    ├── Dockerfile                # Frontend container image (multi-stage, standalone Next.js output)
    └── lib/api.ts                 # HTTP client — the source of truth for the API contract
```

**Frontend → Backend:** in local development the frontend runs on `http://localhost:3000` and calls the backend on `http://localhost:8000`. In production, `NEXT_PUBLIC_API_URL` is baked into the frontend build and points at the deployed backend's custom domain.

## Screens and what each one actually does

| # | Screen | Route | Real functionality |
|---|--------|-------|---------------------|
| 1 | Onboarding | `/` | Submits fixed income, a dynamic list of fixed expenses (name, billing day, whether the amount varies), savings goal, and display currency to `POST /api/onboarding`, and computes an initial Trust Score. |
| 2 | Home | `/home` | Pulls `GET /api/dashboard`: Trust Score gauge (with a tap-to-expand algorithm breakdown), income/expense balance, safety-cushion days, today's remaining budget, "missing data" and "variable expense without an amount" alerts, "Monthly Commitments" status (fixed expenses vs. real transactions), the AI proactive brief, and the last 3 transactions. Includes a quick-add modal for manual entries. |
| 3 | AI Hub | `/ai-hub` | Natural-language chat: typing *"spent 45 on transport"* gets parsed by `POST /api/ai-chat` (amount, category, type), with a "Confirm transaction" button that actually saves it (`POST /api/transactions`). Also supports attaching a receipt photo, analyzed by an NVIDIA NIM vision model (`POST /api/receipt-scan`) which returns merchant, category, amount, type, and date, rendered as a structured "JSON · ready to audit" card before confirming. |
| 4 | History | `/historial` | Lists transactions (`GET /api/transactions`) with filters for type, category, month, and receipt status; edit any transaction (including re-scanning its receipt with AI) via a modal (`PATCH /api/transactions/{id}`), delete it (`DELETE /api/transactions/{id}`), or export the filtered view as CSV. |
| 5 | Analytics Center | `/analitica` | 30-day Trust Score trend, income vs. expense donut, top-3-categories donut, a 5-month historical bar chart, a daily cumulative-spend line chart, "small treats" (gastos hormiga) detection, safety cushion, and today's daily budget (`GET /api/analytics`, `/api/analytics/historical`, `/api/analytics/daily-pace`). |
| 6 | Settings | `/ajustes` | Edits the full financial profile (same form as Onboarding, pre-filled from `GET /api/profile`), notification preferences, display currency, and interface language (English/Spanish). |

## Design

The design system (colors, Inter typeface, spacing, corner radii) was extracted directly from the Stitch-generated `DESIGN.md` and translated into a Tailwind CSS v4 theme in `frontend/app/globals.css`, so the finished app matches the original mockup.

## Running it locally

### 1. Backend (FastAPI)

```bash
uv sync
cp .env.example .env   # fill in DATABASE_URL, NVIDIA_*, GCS_RECEIPTS_BUCKET, etc.
uv run alembic upgrade head
uv run uvicorn main:app --reload --port 8000
```

This exposes the API at `http://localhost:8000` (interactive docs at `http://localhost:8000/docs`).

### 2. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

This starts the app at `http://localhost:3000`.

## Environment variables (backend)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g. Supabase). |
| `NVIDIA_API_KEY`, `NVIDIA_INVOKE_URL`, `NVIDIA_MODEL` | Yes | AI Hub chat (`POST /api/ai-chat`) and receipt scanning share this NIM connection unless overridden. |
| `NVIDIA_RECEIPT_MODEL` | No | Vision model for receipt scanning; defaults to `nvidia/llama-3.1-nemotron-nano-vl-8b-v1`. |
| `NVIDIA_RECOMMENDATIONS_API_KEY`, `NVIDIA_RECOMMENDATIONS_INVOKE_URL`, `NVIDIA_RECOMMENDATIONS_MODEL` | No | Separate NIM connection for the Home proactive-brief insights; falls back to deterministic advice if unset. |
| `OPENAI_API_KEY` | No | Reserved for an OpenAI-based fallback; the app runs fully on NVIDIA NIM without it. |
| `GCS_RECEIPTS_BUCKET` | Yes (for receipts) | Private Google Cloud Storage bucket for receipt photos. |
| `GOOGLE_CLOUD_PROJECT` | Yes (for receipts) | GCP project that owns the bucket. |
| `PUBLIC_API_URL` | Yes (production) | Public URL of the backend, used to build receipt access links. Defaults to `http://localhost:8000`. |
| `RECEIPT_ACCESS_SECRET` | Recommended (production) | HMAC secret signing receipt access tokens; derived from `DATABASE_URL` if unset. |
| `CORS_ORIGINS` | Yes | Comma-separated list of allowed frontend origins. |

## Backend endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Backend health check. |
| `POST` | `/api/onboarding` | Saves the user's initial financial profile (income, fixed expenses, savings goal, currency). |
| `GET` | `/api/profile` | Returns the current financial profile. |
| `GET` | `/api/dashboard` | Data for Home, including the Trust Score breakdown and the AI proactive brief. |
| `GET` | `/api/assistant/brief` | Personalized recommendations (projected savings, spending pace, top category); refreshed on data change or every 6 hours. |
| `GET` | `/api/transactions` | Transaction list, with optional `category`, `kind`, `month`, `evidence` filters. |
| `POST` | `/api/transactions` | Creates a transaction; requires a receipt for expenses. |
| `PATCH` | `/api/transactions/{id}` | Updates an existing transaction (title, amount, date, category, icon, receipt). |
| `DELETE` | `/api/transactions/{id}` | Deletes a transaction. |
| `GET` | `/api/receipts/{transaction_id}` | Streams a private receipt image after validating a short-lived signed token. |
| `GET` | `/api/analytics` | Analytics Center data (trend, categories, income vs. expense, small treats, daily budget). |
| `GET` | `/api/analytics/historical` | Total spend for each of the last N months (bar chart). |
| `GET` | `/api/analytics/daily-pace` | Cumulative daily spend for a given month (line chart). |
| `GET` | `/api/alerts` | Variable expenses missing an amount and transactions missing a receipt. |
| `GET` | `/api/transactions/export` | Exports the filtered history as CSV. |
| `POST` | `/api/ai-chat` | Detects amount, category, and type from a natural-language message via NVIDIA NIM. |
| `POST` | `/api/receipt-scan` | Analyzes a receipt photo via NVIDIA NIM Vision and returns merchant, category, amount, type, and date. |

All endpoints accept three optional headers that don't change the response shape but do change its content:
- `X-Session-Id` — anonymous per-browser UUID for data isolation (see `_resolve_user`).
- `X-Timezone` — IANA timezone (e.g. `America/Lima`) so day/month bucketing matches the visitor's own calendar day (see `_resolve_timezone`).
- `X-Language` — `en` or `es`, translates server-generated text like dates, Trust Score labels, and AI insights (see `_resolve_language`).

Financial data lives in PostgreSQL. Receipt images live in the private GCS bucket configured by `GCS_RECEIPTS_BUCKET`; PostgreSQL only keeps their path, status, and content type. Apply the schema with `uv run alembic upgrade head` before the first run.

## Deployment

The app runs on **Google Cloud Run** (`synapse-dafi` project, `us-central1`), one service each for backend and frontend, both built from their respective `Dockerfile`s via Cloud Build. Custom domains (`confia.dafi.dev`, `confia-backend.dafi.dev`) are mapped through Cloud Run domain mappings, with DNS managed in Cloudflare (`CNAME → ghs.googlehosted.com`, proxy off, Google-managed TLS certificates). Secrets (`DATABASE_URL`, `NVIDIA_API_KEY`, `RECEIPT_ACCESS_SECRET`) are stored in Secret Manager and mounted as environment variables at deploy time. The Cloud Run service account needs `roles/storage.objectUser` on the receipts bucket and `roles/secretmanager.secretAccessor` on each secret.

```bash
# Backend
gcloud builds submit . --tag us-central1-docker.pkg.dev/synapse-dafi/cloud-run-source-deploy/confia-backend:latest
gcloud run deploy confia-backend --image .../confia-backend:latest --region us-central1 \
  --set-env-vars "CORS_ORIGINS=https://confia.dafi.dev,PUBLIC_API_URL=https://confia-backend.dafi.dev,..." \
  --set-secrets "DATABASE_URL=CONFIA_DATABASE_URL:latest,NVIDIA_API_KEY=CONFIA_NVIDIA_API_KEY:latest,RECEIPT_ACCESS_SECRET=CONFIA_RECEIPT_ACCESS_SECRET:latest"

# Frontend (NEXT_PUBLIC_API_URL must be set at build time, not deploy time)
gcloud builds submit . --config cloudbuild-frontend.yaml   # passes --build-arg NEXT_PUBLIC_API_URL
gcloud run deploy confia-frontend --image .../confia-frontend:latest --region us-central1
```

## Notes for the hackathon demo

- The AI Hub chat and receipt scan both run on **NVIDIA NIM**, not OpenAI — the model names are `minimaxai/minimax-m3` (chat) and `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` (receipt vision) by default.
- A new install starts with no demo data. Create a profile and log a few transactions through the normal flow.
- Suggested demo flow: Onboarding (with at least one fixed expense) → Home → AI Hub (log one expense by text, one by receipt photo) → History (see them appear, edit one) → Analytics → Settings (switch currency/language).
