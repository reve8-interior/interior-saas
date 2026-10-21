# Interior Designer Portal

An AI-assisted client management portal for interior design studios. Automates the client journey from first conversation to approved quotation.

- **Frontend** — Next.js (App Router), TypeScript, Tailwind CSS
- **Backend** — FastAPI, SQLAlchemy, Alembic, local JWT auth, multi-tenant (businesses) with Postgres RLS
- **Database** — PostgreSQL (Supabase in prod)
- **Automation** — n8n pipeline (external) pushes checkpoints via webhook

## What It Does

1. **Checkpoint system** — n8n or manual entries capture conversation summaries and structured diffs. Full history is preserved, never overwritten.
2. **Design gallery** — Designers upload designs with structured specs (`specs_json`). AI-generated designs can be added via the backend.
3. **Quotation engine** — Calculates cost from `specs_json × materials_rates × margin_config`. Produces a line-item breakdown with min/max range.
4. **Phase tracking** — Projects flow through: Discussion → Design → Quotation → Implementation → Completed.

## Quick Start

### 1. Prerequisites

- Python 3.12+, Node.js 20+, Docker & Compose v2

### 2. Run with Docker (recommended)

```bash
# Copy and fill in env vars
cp backend/.env.dev_example backend/.env.dev

# Start everything (Postgres + backend + frontend)
docker compose -f .compose/dev.yml up
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Swagger: http://localhost:8000/docs

### 3. Run locally

```bash
# Start Postgres only
docker compose -f .compose/dev.yml up -d dev-db

# Backend
cd backend
python -m venv .venv && source .venv/Scripts/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.dev_example .env.dev  # fill in values
alembic upgrade head
python -m backend

# Frontend (new terminal)
cd frontend
npm install
cp .env_local_example .env.local  # set NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm run dev
```

### 4. Admin user and demo data

- On first startup the backend creates/promotes the `INITIAL_ADMIN_EMAIL` user as `superadmin`; log in at `/login`.
- Optional demo data (from the repo root): `python -m backend.seed_demo [--reset] [--business NAME]`

## Project Structure

```
interior-designer-portal/
├── backend/            # FastAPI app (see backend/README.md)
│   ├── agents/         # AI checkpoint extraction agent + prompts
│   ├── core/           # Config, DB, JWT auth, logging, bootstrap
│   ├── models/         # SQLAlchemy models
│   ├── schemas/        # Pydantic schemas
│   ├── routers/        # Route handlers
│   ├── services/       # Quotations, storage, AI access/pricing, sharing, team
│   ├── migrations/     # Alembic migrations
│   └── tests/          # pytest suite (needs Postgres)
├── frontend/src/
│   ├── app/
│   │   ├── dashboard/  # Board, clients, materials, portfolio, team, settings, guide
│   │   ├── admin/      # Superadmin panel (businesses, settings)
│   │   ├── login/
│   │   └── share/, quotation/, portfolio/   # Public token-based share pages
│   └── lib/            # API client and typed helpers (+ vitest tests)
├── .compose/           # dev.yml, prod.yml (test.yml is outdated)
├── docs/               # Deployment and env-var guides
├── render.yaml         # Render blueprint (backend)
└── .github/workflows/  # Lint, test and deploy pipelines
```

## Environment Variables

### Backend (`backend/.env.dev`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `INITIAL_ADMIN_EMAIL` | Seed admin email |
| `INITIAL_ADMIN_PASSWORD` | Seed admin password |
| `N8N_WEBHOOK_SECRET` | Shared secret for n8n → API calls |
| `SECRETS_ENCRYPTION_KEY` | Fernet key encrypting per-business OpenAI keys (derived from `JWT_SECRET` if empty) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL (e.g. `http://localhost:8000/api/v1`) |

## n8n Integration

n8n calls `POST /api/v1/n8n/checkpoint` with the header `X-Webhook-Secret: <N8N_WEBHOOK_SECRET>` and a JSON body:

```json
{
  "client_id": "uuid",
  "summary_text": "Client wants oak finish instead of walnut...",
  "structured_diff": { "finish": { "from": "walnut", "to": "oak" } },
  "raw_conversation": "...",
  "status": "draft"
}
```

## Deployment

Tag-based deploy via GitHub Actions:

```bash
git tag b-prod-v0.1.0 && git push --tags  # deploy backend
git tag f-prod-v0.1.0 && git push --tags  # deploy frontend
```

Requires Render (backend) and Vercel (frontend) secrets in GitHub.
