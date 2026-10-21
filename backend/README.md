# Interior Designer Portal — Backend

Multi-tenant FastAPI backend for interior design studios: clients, AI-assisted conversation checkpoints, design gallery with hotspots, versioned quotations, and share links. Postgres with row-level security (RLS) isolates each business.

See the [root README](../README.md) for the full-stack overview and [docs/](../docs/) for deployment and env-var references.

## Stack

- FastAPI, Uvicorn (uvloop on Linux/Mac), Pydantic v2 / pydantic-settings
- SQLAlchemy 2.0, psycopg 3, Alembic, PostgreSQL 16
- Local JWT auth (python-jose, passlib/bcrypt) with `superadmin` / admin / designer roles
- OpenAI + pydantic-ai (per-business API key, encrypted at rest) for checkpoint extraction and transcription
- openpyxl for quotation XLSX import/export
- structlog for logging
- Storage: local disk (dev) or Supabase bucket (prod)

## Setup

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows; use .venv/bin/activate on Linux/Mac
pip install -r requirements-dev.txt   # requirements.txt for runtime only
cp .env.dev_example .env.dev          # then edit values
```

## Environment Files

| File                | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `.env.dev`          | Local dev (local Postgres, local file storage)  |
| `.env.dev_example`  | Template for dev                                |
| `.env.prod`         | Production secrets (gitignored)                 |
| `.env.prod_example` | Template for prod                               |

Settings are defined in [core/config.py](core/config.py); see [docs/ENV_VARIABLES.md](../docs/ENV_VARIABLES.md) for every variable.

Key variables: `DATABASE_URL`, `JWT_SECRET`, `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`, `N8N_WEBHOOK_SECRET`, `ALLOWED_ORIGINS`, `FRONTEND_URL`, `API_BASE_URL`, `STORAGE_BACKEND` (`local` | `supabase`), `SECRETS_ENCRYPTION_KEY`.

## Running

The server runs as a module (`python -m backend`) from the **repo root**, with the venv active:

```bash
# Start Postgres (repo root)
docker compose -f .compose/dev.yml up -d dev-db

# Apply migrations (alembic runs from backend/)
(cd backend && alembic upgrade head)

# Start the server (auto-reload when ENV=development)
python -m backend
```

- API: http://localhost:8000 — Swagger at `/docs`, health at `/health`
- Full stack in Docker (db + api + web): `docker compose -f .compose/dev.yml up`
- On startup, the user from `INITIAL_ADMIN_EMAIL` is created/promoted to `superadmin` ([core/bootstrap.py](core/bootstrap.py))

### Demo data

```bash
python -m backend.seed_demo                      # 7 demo clients with checkpoints, designs, quotations
python -m backend.seed_demo --reset              # recreate demo clients
python -m backend.seed_demo --business "Studio"  # seed into one business
```

## Database Migrations (Alembic)

Run from `backend/`:

```bash
alembic upgrade head                                  # apply all
alembic revision --autogenerate -m "describe change"  # after model changes
alembic downgrade -1                                  # roll back one
alembic current                                       # show revision
alembic history --verbose
```

Migrations live in `migrations/versions/` (date-prefixed, committed). RLS policies are applied via [rls.py](rls.py).

## API

All routes are mounted under `/api/v1` (see [main.py](main.py)):

| Router                | Prefix / area                                  |
| --------------------- | ---------------------------------------------- |
| `auth`                | `/auth` — login, profile, password change      |
| `admin_monitor`       | `/admin` — platform usage monitoring           |
| `businesses`, `business_users` | `/businesses` — tenants and their users |
| `team`                | `/team` — in-business team management          |
| `clients`             | `/clients` — client CRUD, per-client access    |
| `checkpoints`, `checkpoint_ai` | conversation checkpoints, AI extraction/transcription |
| `designs`, `media`    | design gallery, portfolio, hotspots, images    |
| `share`               | share links (authenticated + public routes)    |
| `quotations`, `quotation_versions` | quotations, versions, agreed version, XLSX |
| `materials`           | material rates and margins                     |
| `settings`            | app/business settings                          |
| `dashboard`           | dashboard aggregates                           |
| `n8n`                 | `/n8n` — webhook (`X-Webhook-Secret` header)   |

## Testing

Tests need a **disposable Postgres** (RLS and enums are Postgres features). The schema is dropped and recreated, and the role must be able to `CREATE ROLE`.

```bash
# Throwaway Postgres on the default test URL
docker run -d --name designer-test-db -p 5433:5432 \
  -e POSTGRES_USER=reve8 -e POSTGRES_PASSWORD=reve8 -e POSTGRES_DB=reve8 \
  postgres:16-alpine

# Optional: override the default (postgresql+psycopg://reve8:reve8@localhost:5433/reve8)
export TEST_DATABASE_URL=postgresql+psycopg://reve8:reve8@localhost:5433/reve8

pytest tests -v
pytest tests/test_quotation_service.py -v   # single file
pytest -k test_rls -v                       # by name
```

Tests live flat in `tests/` (`test_<module>.py`); fixtures are in [tests/conftest.py](tests/conftest.py). CI (`.github/workflows/ci-backend.yml`) runs `ruff check`, `ruff format --check`, and `pytest tests -v` against a Postgres 16 service.

## Linting

```bash
ruff check . --fix
ruff format .
```

## Project Structure

```
backend/
├── __main__.py        # `python -m backend` entrypoint (uvicorn)
├── main.py            # FastAPI app, middleware, router mounting
├── rls.py             # Row-level security policies
├── seed_demo.py       # Demo data seeder
├── agents/            # AI checkpoint extraction agent
│   └── prompts/       # System prompts
├── core/              # config, database, security (JWT), logging, bootstrap
├── models/            # SQLAlchemy models (business, client, checkpoint, design, quotation, ...)
├── schemas/           # Pydantic request/response models
├── routers/           # Route handlers (one file per domain)
├── services/          # Business logic: quotations/versions/XLSX, AI access & pricing,
│                      #   storage, share links, team, client access, subscriptions, ...
├── migrations/        # Alembic scripts
└── tests/             # pytest suite
```

## Deployment

- Backend: Render via [Dockerfile](Dockerfile) (see [render.yaml](../render.yaml)), deployed by pushing a `b-prod-v*` tag
- Frontend: Vercel, `f-prod-v*` tag
- Details: [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)
