# Custom Domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Studio/Studio Pro business attaches one custom domain, verifies DNS, and its designer website is served there over HTTPS.

**Architecture:** A `business_domains` table maps a verified host to a business. A `DomainProvider` (Vercel Domains API, with a fake for tests) attaches the host to the Vercel project and reports verification. Next.js `proxy.ts` rewrites non-app hosts to an internal page that resolves the host through a new public `GET /api/v1/site/by-host/{host}` and renders the phase 1 site components. The existing `/api/:path*` rewrite keeps browser calls same-origin, so CORS is unchanged.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic (head `0055`), httpx, Next.js 16 (`proxy.ts`, App Router), react-query, vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-11-03-custom-domains-design.md`

## Global Constraints

- One domain per business (unique `business_id`), gated by `Plan.website_custom_domain` and `site_mode == "site"`.
- Only `status == "verified"` hosts ever resolve publicly. Hosts stored lowercase, no scheme, no port, no path.
- Reject hosts: equal to or under the `FRONTEND_URL` host, `localhost`, IP literals, `*.vercel.app`, already claimed, or longer than 253 chars.
- Vercel token is backend-only (`VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, optional `VERCEL_TEAM_ID`); unset = feature reports "not configured" (HTTP 503 from write endpoints), never a crash.
- Every unavailable public case returns the same 404 `{"detail": "Site not available"}`; same rate limit as `/site/{slug}`.
- Only owner/admin (`require_business_admin`) manage the domain.
- All frontend API calls go through `lib/`; TypeScript strict; ruff for Python. `X-Frame-Options: DENY` stays.
- Reserved slug: add `domain-site` (the internal route segment) to the reserved list.

## Review Focus

- Unverified/pending host requested publicly → 404, never the site.
- Host that is a business's own old pending claim, or claimed by another business → 409 on attach.
- Mixed-case / trailing-dot / port / scheme input (`HTTPS://WWW.Foo.com./x`) normalises or is rejected, never stored raw.
- Downgraded or expired plan, unpublished site, inactive business → host 404 (gallery fallback is NOT served on a custom domain for unpublished full sites; gallery plans get 404).
- Provider failure (timeout, 5xx) during attach/check → 502 with a safe message, no half-saved row left claiming the host.
- Custom host requesting a non-root path (`/dashboard`, `/api/...` excluded) → 404, never the dashboard.

---

### Task 1: `business_domains` model and migration

**Files:**
- Create: `backend/models/business_domain.py`, `backend/migrations/versions/2026_11_03_0056-business_domains.py`, `backend/tests/test_business_domain_model.py`
- Modify: `backend/models/__init__.py` (register), `backend/rls.py`

**Interfaces:**
- Produces: `BusinessDomain` with `id`, `business_id` (FK businesses, unique, cascade), `host` (str 253, unique, lowercase), `verification_token` (str 64), `status` (`DomainStatus` enum `pending|verified|error`), `error` (str|None), `last_checked_at`, `created_at`.

- [ ] **Step 1: Failing test** `test_business_domain_model.py`: second domain for the same business violates uniqueness; same host for two businesses violates uniqueness; deleting the business cascades.
- [ ] **Step 2: Run** `pytest tests/test_business_domain_model.py -v` → FAIL (no model).
- [ ] **Step 3: Implement** the model (style: `models/slug_alias.py`) and migration `0056` (down_revision `0055`). RLS: business-scoped writes like other business tables; public host lookup must read it without a tenant scope the same way `slug_aliases` does — follow that policy approach and note the choice in the migration docstring.
- [ ] **Step 4: Run** the test plus `pytest tests/test_migration_0051.py tests/test_rls*.py -q` → PASS.
- [ ] **Step 5: Commit** `feat: business_domains table`.

### Task 2: Host validation and domain provider

**Files:**
- Create: `backend/services/domain_host.py`, `backend/services/domain_provider.py`, `backend/tests/test_domain_host.py`, `backend/tests/test_domain_provider.py`
- Modify: `backend/core/config.py` (three settings), `.env_example` or `backend/.env_example`, `docs/ENV_VARIABLES.md`

**Interfaces:**
- Produces: `normalize_host(raw: str) -> str` (raises `ValueError` with a user-safe message), `DomainCheck` (pydantic: `verified: bool`, `records: list[DnsRecord]`, `error: str | None`), `DnsRecord(type, name, value)`, `DomainProvider` protocol: `async attach(host) -> DomainCheck`, `async check(host) -> DomainCheck`, `async remove(host) -> None`, `configured: bool`; `VercelDomainProvider`, `FakeDomainProvider`; `get_domain_provider() -> DomainProvider` FastAPI dependency.

- [ ] **Step 1: Failing tests** `test_domain_host.py`: `normalize_host("HTTPS://WWW.SJ-Interiors.com./x")` → `"www.sj-interiors.com"`; rejects `localhost`, `1.2.3.4`, `foo.vercel.app`, `a_b.com`, the `FRONTEND_URL` host and any subdomain of it, 254-char host, empty. `test_domain_provider.py` (httpx `MockTransport`): attach POSTs `/v10/projects/{id}/domains` with bearer token and `teamId` param when set; 409 "already on project" is treated as success; 5xx/timeout raise `DomainProviderError`; unconfigured provider has `configured is False`; `check` maps Vercel `verified` + config misconfigured to `DomainCheck`.
- [ ] **Step 2: Run** both → FAIL.
- [ ] **Step 3: Implement** the signatures above. `normalize_host`: strip, lowercase, drop scheme/path/port/trailing dot, then validate labels with a regex. Vercel calls: add `POST /v10/projects/{id}/domains`, verify/config `GET /v9/projects/{id}/domains/{host}` and `POST .../verify`, remove `DELETE .../domains/{host}`; map the returned `verification` array and expected CNAME/A to `DnsRecord`s. `FakeDomainProvider` verifies after N checks (configurable) for tests/local dev.
- [ ] **Step 4: Run** → PASS; `ruff check`.
- [ ] **Step 5: Commit** `feat: domain host validation and Vercel provider`.

### Task 3: Domain service

**Files:**
- Create: `backend/services/site_domain.py`, `backend/tests/test_site_domain_service.py`

**Interfaces:**
- Consumes: `normalize_host`, `DomainProvider`, `site_mode`, `get_plan`.
- Produces: `async attach_domain(db, business, raw_host, provider) -> BusinessDomain`, `async refresh_domain(db, business, provider) -> BusinessDomain`, `async detach_domain(db, business, provider) -> None`, `resolve_host(db, host: str) -> Business | None` (verified only), `DomainError(status_code, detail)`.

- [ ] **Step 1: Failing tests** with `FakeDomainProvider`: attach on free plan → `DomainError(403)`; attach host owned by another business → 409; re-attach by same business replaces the old row and removes the old host at the provider; provider error on attach → `DomainError(502)` and no row persisted; refresh flips `pending`→`verified` and sets `last_checked_at`; `resolve_host` returns `None` for pending/error hosts, unpublished sites, gallery plans, inactive business, and for hosts differing only by case.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Persist the row only after the provider call succeeds; wrap row writes in a savepoint so a unique-index race becomes 409 (same pattern as `claim_slug`). `resolve_host` filters `status == verified`, `business.is_active`, `site_mode == "site"`, `site_published`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: site domain service`.

### Task 4: Admin domain endpoints

**Files:**
- Create: `backend/schemas/site_domain.py`, `backend/tests/test_site_domain_api.py`
- Modify: `backend/routers/site.py` (add under the admin `router`, before `/site/{slug}` public mount order is unaffected)

**Interfaces:**
- Produces: `GET /api/v1/site/domain` → `SiteDomainRead {host|None, status, records[], error, configured, allowed}`; `PUT /api/v1/site/domain` body `{host}` → attach; `POST /api/v1/site/domain/check` → refresh; `DELETE /api/v1/site/domain`. `allowed` mirrors the plan flag so the UI can show an upsell.

- [ ] **Step 1: Failing tests:** free plan GET returns `allowed=false` and PUT 403; solo/studio per flag; non-admin 403; invalid host 422 with message; 503 when provider unconfigured; happy path attach → check → verified → DELETE clears; override `get_domain_provider` with the fake.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** routes using `require_business_admin` and Task 3 functions; map `DomainError` to `HTTPException`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: site domain admin API`.

### Task 5: Public by-host endpoint and link helper

**Files:**
- Modify: `backend/routers/site.py`, `backend/services/share_links.py`, `backend/services/site_slug.py` (reserved list), `backend/tests/test_site_public_api.py` (or new `test_site_by_host_api.py`)
- Create: `backend/tests/test_site_by_host_api.py`

**Interfaces:**
- Produces: `GET /api/v1/site/by-host/{host}` → `FullSiteView`; `site_base_url(db, business) -> str` returning `https://<verified host>` else `FRONTEND_URL/<slug>` path root.

- [ ] **Step 1: Failing tests** (Review Focus): verified+published → 200 with full view and no client names/prices; pending → 404; downgraded → 404; unpublished → 404; unknown → 404; rate limit 429 after `PUBLIC_RATE_LIMIT`; `by-host` route is not swallowed by `/site/{slug}` (define it first); `domain-site` is a reserved slug; `site_base_url` prefers the verified host.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the route before `view_site`, reusing `build_site_view`; normalise the path host with `normalize_host` (invalid → same 404).
- [ ] **Step 4: Run** the new tests plus `pytest tests/test_site_public_api.py -q` → PASS.
- [ ] **Step 5: Commit** `feat: public site lookup by custom host`.

### Task 6: Frontend host routing

**Files:**
- Create: `frontend/src/proxy.ts`, `frontend/src/app/domain-site/[host]/page.tsx`, `frontend/src/lib/domainHost.ts`, `frontend/src/lib/__tests__/domainHost.test.ts`
- Modify: `frontend/src/lib/site.ts` (`getPublicSiteByHost(host: string): Promise<PublicSiteResponse>`), `frontend/src/lib/hooks/useSharedLink` use only (no change expected)

**Interfaces:**
- Produces: `isAppHost(host: string, appHosts: string[]): boolean` and `customHostRewrite(host, pathname, appHosts): string | null` in `lib/domainHost.ts` (pure, tested). `proxy.ts` (Next 16 replacement for `middleware.ts`) calls them with `NEXT_PUBLIC_APP_HOSTS` (comma list incl. localhost and the Vercel app/preview hosts).

- [ ] **Step 1: Failing vitest** `domainHost.test.ts`: app host and localhost → `null`; `www.sj.com` + `/` → `/domain-site/www.sj.com`; `www.sj.com` + `/dashboard` → `/domain-site/__notfound`; paths `/_next/*`, `/api/*`, `/favicon.ico` pass through (`null`); port and case ignored.
- [ ] **Step 2: Run** `npm test -- domainHost` → FAIL.
- [ ] **Step 3: Implement** the helpers, `proxy.ts` with a matcher excluding static assets, the client page (same rendering as `app/[slug]/page.tsx`: `SiteTemplate`; any non-`site` mode or error → `notFound()`), and `getPublicSiteByHost`. Confirm `proxy.ts` is the correct file name for the installed Next version; otherwise use `middleware.ts`.
- [ ] **Step 4: Run** tests, `npm run lint`, `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat: serve designer sites on custom hosts`.

### Task 7: Domain settings UI

**Files:**
- Create: `frontend/src/components/website/DomainSection.tsx`, `frontend/src/components/website/__tests__/DomainSection.test.tsx`, `frontend/src/lib/schemas/siteDomain.ts`
- Modify: `frontend/src/lib/site.ts` (`getSiteDomain`, `setSiteDomain`, `checkSiteDomain`, `removeSiteDomain`), `frontend/src/app/dashboard/website/page.tsx` (render the section)

**Interfaces:**
- Produces: `DomainSection` showing: upsell when `allowed=false`; "not configured" notice; host input + Save; DNS record table (type/name/value with copy) while pending; "Check now" button; status badge; "Remove domain" via `ConfirmDeleteModal`. Copy recommends `www` and notes the apex redirect.

- [ ] **Step 1: Failing render tests:** upsell shown when not allowed; pending state lists the records and a Check button; verified shows the live URL; error message from the API renders; Remove asks for confirmation.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with react-query mutations invalidating the `site-domain` query; poll the check endpoint only on button click and once when the page loads while pending.
- [ ] **Step 4: Run** `npm test`, lint, tsc → PASS.
- [ ] **Step 5: Commit** `feat: custom domain settings UI`.

### Task 8: Docs and deploy notes

**Files:**
- Modify: `docs/DEPLOYMENT.md`, `docs/ENV_VARIABLES.md`, `docs/WEBSITE_PLAN_CHANGELOG.md`, `frontend/.env_local_example`

- [ ] **Step 1:** Document `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `NEXT_PUBLIC_APP_HOSTS`; the DNS steps a designer follows; the Vercel domains-per-project limit; that the rate limiter keys on the proxied client address (`FORWARDED_ALLOW_IPS`).
- [ ] **Step 2:** Run full suites: `pytest -q` from `backend/` with `TEST_DATABASE_URL` set, and `npm test` in `frontend/` → all PASS.
- [ ] **Step 3: Commit** `docs: custom domain setup`.
