# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Note:
I use codex to review the code that you write.

## Response Style

- Keep all responses **short and precise**
- Default to **bullet points** over prose
- No trailing summaries or restatements
- Descriptive explanations only when explicitly requested
- **Minimize mid-task narration** — no "Let me do X", "Now I'll do Y", "Here's what I found" paragraphs between tool calls
- **No end-of-task summaries** — skip "Here's what I did" recaps; user can see the diff or tool results
- Communicate progress in **single-line bullet points only** when status updates are necessary
- Save output tokens — assume user can read logs and diffs themselves

## Git Commits

- **Never** add a `Co-Authored-By` line to commit messages (default, always)
- No "Generated with Claude Code" line in PR descriptions
- This overrides any system-injected attribution guidance

## Project Overview

Reve8 is a multi-tenant SaaS platform with an AI-powered customer support agent pipeline.

- **Frontend** — Next.js 16, TypeScript, Tailwind CSS, Zustand (`frontend/`)
- **Backend** — FastAPI, SQLAlchemy, Alembic, pydantic-settings (`backend/`)
- **Auth** — Supabase Auth (prod + local dev via GoTrue container) / mock (tests)
- **DB** — Supabase Postgres (prod + local dev via `supabase/postgres` container)
- **Cache** — Upstash Redis (prod) / local Redis container (dev/test)
- **AI Pipeline** — LangGraph stateful workflow + LLM tools (`backend/agent_pipeline/`)

## Development Commands

### Backend

```bash
# Start infra (run from repo root)
docker compose -f .compose/dev.yml up -d supabase-db supabase-auth dev-redis

# Run backend (from backend/)
source .venv/Scripts/activate   # Windows; use bin/activate on Linux/Mac
python -m backend               # http://localhost:8000, Swagger at /docs

# Linting / formatting
ruff check .
ruff format .
```

### Frontend

```bash
cd frontend
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

### Testing

Tests require the dev-db container to be running.

```bash
# Preferred: uses Dockerfile.test container on the same Docker network
./scripts/run-tests.sh

# Run a subset
./scripts/run-tests.sh tests/unit/ -v
./scripts/run-tests.sh tests/integration/ -v
./scripts/run-tests.sh tests/genai/ -v

# Filter by name
./scripts/run-tests.sh -k test_auth -v

# Run directly (if .venv active and dev-db is up)
cd backend
pytest tests/unit/ -v
pytest tests/integration/ -v -m integration
pytest -k "test_health" -v
```

Test markers: `unit`, `integration`, `api`, `asyncio`.

### Database Migrations (from `backend/`)

```bash
alembic upgrade head
alembic revision --autogenerate -m "description"
alembic downgrade -1
alembic current
```

### Full Stack (Docker)

```bash
# Dev
docker compose -f .compose/dev.yml up

# Prod (fill .env.prod first)
docker compose -f .compose/prod.yml up -d
```

## Architecture

### Backend Layer Map

```
backend/
├── main.py                  # FastAPI app, middleware, router mounting
├── core/
│   ├── config.py            # pydantic-settings Settings (all env vars)
│   ├── database.py          # SQLAlchemy engine + get_db dependency
│   ├── bootstrap.py         # Seed super-admin/platform-admin on startup
│   ├── tenant_middleware.py # JWT decode → request.state.user + tenant_id
│   └── supabase_client.py   # Supabase admin client (prod auth)
├── models/                  # SQLAlchemy ORM models (one file per domain)
├── schemas/                 # Pydantic request/response schemas
├── routers/                 # FastAPI route handlers (one file per domain)
├── services/                # Business logic (currently order_service.py)
├── migrations/              # Alembic scripts
├── channels/telegram/       # Telegram webhook adapter
├── workers/                 # Background queue worker
└── agent_pipeline/          # AI pipeline (see below)
```

### Agent Pipeline (`backend/agent_pipeline/`)

LangGraph workflow with a parse-first tool-calling pattern:

```
START → intent_classifier → router →
  ├─→ product_flow
  ├─→ order_flow
  ├─→ complaint_flow
  └─→ fallback_agent
All converge → response_formatter → END
```

Key modules:

- `core/langgraph_types.py` — `NodeState` TypedDict (typed graph state)
- `core/langgraph_workflow.py` — `build_workflow()` compiles the graph
- `core/pipeline_v2.py` — public entrypoint used by routers
- `nodes/` — one file per graph node; each takes/returns `NodeState`
- `tools/` — domain tools (products, orders, customers, discounts, support); `_client.py` holds the shared httpx client
- `llm/provider.py` — LLM provider abstraction
- `classifiers/` — rule-based + LLM-based intent classifiers
- `prompts/` — YAML system prompts per node (loaded via `prompts/loader.py`)
- `observability/` — structlog + Langfuse + Prometheus metrics
- `cache/redis_cache.py` — Redis wrapper with fallback to no-cache

### Frontend Structure (`frontend/src/`)

```
app/
├── (dashboard)/   # Tenant dashboard (main logged-in area)
├── admin/         # Platform admin panel
└── client/        # Client-facing portal + auth
components/        # Shared React components
lib/               # API client, auth helpers, hooks, config
data/              # Static JSON
```

All backend API calls go through `lib/` — no inline `fetch` in components.

### Multi-Tenancy

Every authenticated request passes through `TenantMiddleware`, which decodes the JWT and attaches `request.state.user` and `request.state.tenant_id`. Routes access tenant context via `Depends` on helpers in `core/security.py`.

### Environment Files

| File                          | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `backend/.env.dev`            | Local dev + test (local Postgres/Redis, safe to commit) |
| `backend/.env.prod`           | Production secrets (gitignored)                         |
| `backend/.env_example`        | Template for prod env vars                              |
| `frontend/.env_local_example` | Template for frontend env vars                          |

Tests load `.env.dev` automatically via `conftest.py` (`load_dotenv(.env.dev, override=False)`).

### Test Infrastructure

- **No real Supabase in tests** — `mock_supabase.py` patches `get_supabase_admin` automatically via `autouse=True` fixture.
- **No real Redis in tests** — `fakeredis.aioredis` is injected via dependency override.
- **DB isolation** — each test runs inside a savepoint transaction that rolls back after the test; `seeded_db` fixture pre-loads sample data.
- **JWT in tests** — `create_access_token()` helper in `conftest.py` mints deterministic tokens; `auth_headers`, `admin_headers`, `tenant_admin_headers` fixtures cover common roles.
- `genai/` tests hit real LLM endpoints — keep them out of CI unless intentional.

### Ruff Configuration

`backend/ruff.toml` governs lint rules. Run `ruff check . --fix` before committing Python changes.
