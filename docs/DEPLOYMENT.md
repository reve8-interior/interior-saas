# Deployment: Render (API) + Vercel (Web) + Supabase (DB)

```
Browser ──► Vercel (Next.js) ──NEXT_PUBLIC_API_URL──► Render (FastAPI) ──► Supabase Postgres
```

Order matters: DB → API → Web → back-fill CORS.

## 1. Supabase (database)

1. Create a project; save the DB password.
2. Dashboard → **Connect** → **Session pooler** (IPv4, port 5432).
   - Render has no IPv6 egress, so the "Direct connection" host will fail.
   - Avoid the transaction pooler (6543): psycopg3 prepared statements break on it.
3. Build `DATABASE_URL`:
   `postgresql+psycopg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`
   - URL-encode special characters in the password.
4. Schema: first API boot runs `init_db()` (create_all + stamp alembic head) on the empty DB.
   Later schema changes: `alembic upgrade head` (step 5).
5. Optional: enable RLS on all `public` tables (no policies). The API connects as
   `postgres` (bypasses RLS) and Supabase's auto REST API is not used, so this blocks
   anon-key access to your tables.

## 2. Render (backend)

1. New → **Blueprint** → select this repo (uses [render.yaml](../render.yaml)).
   Or New → Web Service → Docker, **Root Directory** `backend`, health check `/health`.
2. Fill the `sync: false` env vars (template: `backend/.env.prod_example`):
   - `DATABASE_URL` (step 1)
   - `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` (real values; placeholders abort startup)
   - `API_BASE_URL` = Render URL, `FRONTEND_URL` / `ALLOWED_ORIGINS` = Vercel URL (set after step 3 if unknown)
   - `SECRETS_ENCRYPTION_KEY` (generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
   - OpenAI keys are not env vars: the superadmin sets one per business in `/admin`
3. Deploy; verify `https://<service>.onrender.com/health` → `{"status":"healthy"}`.
4. Startup refuses to run in production if `JWT_SECRET`, `N8N_WEBHOOK_SECRET` or the admin password are placeholders.
5. Migrations: from your machine, with the Supabase URL:
   ```bash
   cd backend
   DATABASE_URL="<supabase url>" alembic upgrade head
   ```
6. CI deploy: add GitHub environment secrets `RENDER_SERVICE_ID`, `RENDER_API_KEY`
   (environments `dev` / `prod`), then push a tag `b-prod-X.Y.Z`.
   Free plan sleeps after ~15 min idle (first request ~30-60 s); use Starter to avoid.

## 3. Vercel (frontend)

1. Import repo → **Root Directory** `frontend`, framework Next.js (see `frontend/vercel.json`).
2. Env vars (Production):
   - `NEXT_PUBLIC_API_URL` = `https://<service>.onrender.com/api/v1`
   - `NEXT_PUBLIC_APP_URL` = `https://<project>.vercel.app`
   - `NEXT_PUBLIC_ENV` = `production`
3. Deploy. Do **not** set `DOCKER_BUILD`.
4. CI deploy: GitHub secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
   `NEXT_PUBLIC_API_URL`; push tag `f-prod-X.Y.Z`.

## 4. Wire CORS back

1. Render → set `ALLOWED_ORIGINS` and `FRONTEND_URL` to the final Vercel URL
   (add a custom domain too, comma-separated, if any). Redeploy.
2. Vercel preview URLs differ per deploy and will be blocked by CORS; test on production URL.

## 5. Smoke test

- [ ] `/health` OK on Render
- [ ] Log in at the Vercel URL with `INITIAL_ADMIN_*`
- [ ] Browser devtools: no CORS errors; requests go to the Render URL
- [ ] Create a client, then a quotation; row visible in Supabase Table Editor
- [ ] Material Excel import works
- [ ] n8n webhook (if used) points to `API_BASE_URL` with `N8N_WEBHOOK_SECRET`
- [ ] Rotate the admin password after first login

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Network is unreachable` / IPv6 error | Used direct host; switch to session pooler |
| `password authentication failed` | User must be `postgres.<ref>` on pooler; check URL-encoding |
| CORS error in browser | `ALLOWED_ORIGINS` mismatch (scheme, trailing slash) |
| Startup `Insecure placeholder values` | Set real secrets in Render env |
| First request very slow | Render free plan cold start |
