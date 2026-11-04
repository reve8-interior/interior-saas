# Designer Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each business a public, readable-link site (`/<slug>`): a simple image gallery on Free, a full single-page website with projects on Solo and above.

**Architecture:** New `Project` model and business site fields; designs become optionally client-less (own `business_id`) so project uploads reuse the image pipeline and quotas. One public endpoint `GET /api/v1/site/{slug}` decides gallery vs. full site from the business's current plan. One Next.js dynamic route `app/[slug]` renders either mode.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Postgres RLS (`backend/rls.py`), Next.js App Router, Tailwind, vitest, pytest (`./scripts/run-tests.sh`).

**Spec:** `docs/superpowers/specs/2026-11-02-designer-website-design.md`

## Global Constraints

- Alembic head is `0050`; new revisions are `0051`+, filename `YYYY_MM_DD_NNNN-name.py`; `tests/test_migration_chain.py` must pass.
- Plan slugs: `free`, `solo`, `studio`, `studio_pro`. Full site from `solo`; custom domain flag on `studio`, `studio_pro` (flag only, no domain feature in this plan); badge removal on `studio_pro`.
- Public site data is a whitelist: project title/story/location/year/category; design title, description, rooms. Never hotspots, prices, client names, or client ids.
- Public routers have no RLS scope: every query filters by `business_id` explicitly.
- Logo/hero: jpg/png/webp only (use `sniff_image_ext`), stored under `branding/`, exempt from image quotas.
- Reserved slugs rejected: `admin, api, client, dashboard, login, portfolio, share, quotation, _next, static, www`.
- Frontend: all API calls via `lib/`, no inline fetch; Tailwind only. Backend: `ruff check . --fix` and `ruff format .`.
- Never add `Co-Authored-By` or "Generated with Claude Code" lines to commits (repo CLAUDE.md).

## Review Focus

- Slug `Sj-Interiors ` / unicode / empty → normalized or rejected, never a 500 (Task 3).
- Old slug after rename → 301-style redirect payload, not 404 (Task 3, 8).
- Unpublished site, inactive business, and unknown slug are indistinguishable 404s publicly (Task 8).
- Downgrade to Free with projects present → gallery served, projects retained in DB (Task 8).
- Project with zero designs / deleted designs → renders without crash; empty site sections hidden (Task 7, 11).
- SVG or oversized logo upload → 415 / 413 (Task 5).
- Public payload contains no hotspot, price, client fields (Task 8).

---

### Task 1: Client-less designs (`Design.business_id`)

**Files:**
- Modify: `backend/models/design.py`, `backend/rls.py`, `backend/services/image_quota.py`, `backend/services/plan_limits.py` (portfolio count), `backend/routers/designs.py` (set `business_id` on create/upload)
- Create: `backend/migrations/versions/2026_11_02_0051-design_business_id.py`
- Test: `backend/tests/test_design_business_id.py`

**Interfaces:**
- Produces: `Design.business_id: UUID` (non-null, FK businesses, indexed); `Design.client_id: UUID | None`. Quota/count helpers count by `Design.business_id`.

- [ ] **Step 1: Write failing tests** — `test_upload_sets_business_id`, `test_uploaded_image_count_includes_clientless_design`, `test_rls_hides_other_business_clientless_design` (insert a design with `client_id=None` for business A; scoped session for business B sees 0 rows).
- [ ] **Step 2: Run** `./scripts/run-tests.sh tests/test_design_business_id.py -v` → FAIL.
- [ ] **Step 3: Migration `0051`:** add `business_id` nullable, backfill from `clients.business_id`, set NOT NULL, make `client_id` nullable, index; change the `designs` policy in `rls.py` `_POLICIES` to `_BUSINESS_PREDICATE` and make the migration recreate that policy (mirror how `0027` handled `portfolio_shares`). `design_hotspots` policy unchanged.
- [ ] **Step 4:** Update model, quota helpers (`uploaded_image_count`, `portfolio_design_count` filter on `Design.business_id`, no join), and set `business_id=client.business_id` in `upload_design` and `upload_design_image`.
- [ ] **Step 5: Run** the full backend suite `./scripts/run-tests.sh -v` → PASS (existing RLS/quota tests included).
- [ ] **Step 6: Commit** `feat: designs carry business_id so they can exist without a client`

### Task 2: `Project` model

**Files:**
- Create: `backend/models/project.py`, `backend/migrations/versions/2026_11_02_0052-projects.py`
- Modify: `backend/models/design.py` (`project_id`, `project_position`), `backend/models/__init__.py`, `backend/rls.py` (`"projects": _BUSINESS_PREDICATE`)
- Test: `backend/tests/test_project_model.py`

**Interfaces:**
- Produces: `Project(id, business_id, title, location, year: int|None, category, story, cover_design_id: UUID|None, position: int, created_at)`; `Design.project_id: UUID|None` (FK `projects.id`, `ondelete=SET NULL`), `Design.project_position: int|None`.

- [ ] **Step 1: Failing tests** — `test_deleting_project_keeps_designs` (designs get `project_id=None`), `test_rls_isolates_projects`.
- [ ] **Step 2–4:** Run to fail; implement model + migration + RLS entry; run to pass.
- [ ] **Step 5: Commit** `feat: add Project model`

### Task 3: Business site profile + slug service

**Files:**
- Modify: `backend/models/business.py`, `backend/models/__init__.py`
- Create: `backend/services/site_slug.py`, `backend/models/slug_alias.py`, `backend/migrations/versions/2026_11_02_0053-business_site_fields.py`
- Test: `backend/tests/test_site_slug.py`

**Interfaces:**
- Produces on `Business`: `slug: str|None` (unique, indexed), `site_published: bool`, `site_tagline`, `site_about`, `site_address`, `site_services: list[{title, description}]` (JSONB), `site_socials: list[{label, url}]` (JSONB), `logo_path`, `hero_path`, `hide_badge: bool`. Reuse existing `contact_email`/`contact_phone`.
- Produces `SlugAlias(slug unique, business_id)`.
- `normalize_slug(raw: str) -> str` (lowercase, trim, spaces/underscores→`-`, strip non `[a-z0-9-]`, collapse dashes, 3–40 chars) raising `ValueError`; `is_reserved(slug) -> bool`; `claim_slug(db, business, raw) -> str` (checks reserved, uniqueness vs `businesses.slug` and `slug_aliases`, writes old slug to aliases, raises `HTTPException(409)`/`422`); `resolve_slug(db, slug) -> tuple[Business, bool]` (bool = was alias).

- [ ] **Step 1: Failing tests:** `normalize_slug("  Sj Interiors! ") == "sj-interiors"`; `normalize_slug("é")` and `""` raise; `is_reserved("admin")`; `claim_slug` twice by two businesses → 409; rename stores alias and `resolve_slug(db, old)` returns `(business, True)`.
- [ ] **Step 2–4:** Run to fail; implement; run to pass.
- [ ] **Step 5: Commit** `feat: business site fields and slug service`

### Task 4: Plan flags

**Files:**
- Modify: `backend/services/plan_catalog.py` (seed values), `backend/core/bootstrap.py` only if seeding needs it
- Create: `backend/migrations/versions/2026_11_02_0054-plan_website_flags.py` (data migration updating existing plan rows)
- Test: extend `backend/tests/test_plans.py`

**Interfaces:**
- Produces: `solo/studio/studio_pro`: `website_enabled=True, website_templates=1`; `studio/studio_pro`: `website_custom_domain=True`; `studio_pro`: `website_remove_badge=True`; `free`: all false.
- Produces `site_mode(db, business) -> Literal["site","gallery"]` in `backend/services/site_access.py` (`"site"` iff effective plan has `website_enabled`; uses `get_plan`, respects expired plans the same way `effective_limits` does).

- [ ] **Step 1: Failing tests:** seeded flags per slug; `site_mode` is `"gallery"` for free, `"site"` for solo.
- [ ] **Step 2–4:** Run to fail; implement; pass.
- [ ] **Step 5: Commit** `feat: enable website plan flags and site_mode`

### Task 5: Logo/hero upload + media prefix

**Files:**
- Modify: `backend/routers/media.py` (allow `branding/` prefix alongside `designs/`)
- Create: `backend/routers/site.py` (admin router, started here), `backend/schemas/site.py`
- Test: `backend/tests/test_site_branding.py`

**Interfaces:**
- Produces: `POST /api/v1/site/logo` and `POST /api/v1/site/hero` (multipart `file`), owner/admin only, return `{"url": str}` (signed media URL). Path `branding/{business_id}/{logo|hero}-{uuid}.{ext}`. Replaces and deletes the old object. 415 for non-jpg/png/webp (incl. SVG), 413 above `effective_max_bytes`.

- [ ] **Step 1: Failing tests:** `test_logo_upload_ok`, `test_svg_rejected_415`, `test_oversize_413`, `test_viewer_role_forbidden`, `test_media_serves_branding_prefix`.
- [ ] **Step 2–4:** Run to fail; implement (reuse `sniff_image_ext`, `get_storage`, `signed_media_url`; no quota check); pass.
- [ ] **Step 5: Commit** `feat: logo and hero upload`

### Task 6: Site settings API

**Files:**
- Modify: `backend/routers/site.py`, `backend/schemas/site.py`, `backend/main.py` (mount routers)
- Test: `backend/tests/test_site_settings_api.py`

**Interfaces:**
- Produces (owner/admin only): `GET /api/v1/site` → `SiteSettingsRead`; `PUT /api/v1/site` ← `SiteSettingsUpdate` (tagline, about, address, phone, email, services, socials, `hide_badge` — rejected 403 unless plan has `website_remove_badge`); `GET /api/v1/site/slug-check?slug=` → `{slug, available, reason|None}`; `PUT /api/v1/site/slug` ← `{slug}` via `claim_slug`; `POST /api/v1/site/publish` / `POST /api/v1/site/unpublish`; `GET /api/v1/site/preview` → same payload as the public endpoint but ignoring `site_published`.
- Publish requires a slug (422 otherwise) and a plan with `website_enabled` (403 on Free; Free's gallery needs only a slug).
- Pydantic limits: tagline ≤120, about ≤4000, services ≤8 items, socials ≤6 items with `http(s)` URLs only.

- [ ] **Step 1: Failing tests:** one per endpoint above plus `test_publish_without_slug_422`, `test_free_cannot_publish_full_site`, `test_socials_reject_javascript_url`.
- [ ] **Step 2–4:** Run to fail; implement; pass.
- [ ] **Step 5: Commit** `feat: site settings, slug and publish API`

### Task 7: Projects API

**Files:**
- Create: `backend/routers/projects.py`, `backend/schemas/project.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_projects_api.py`

**Interfaces:**
- Produces (owner/admin; Free → 403): `GET/POST /api/v1/projects`, `PATCH/DELETE /api/v1/projects/{id}`, `PUT /api/v1/projects/order` (`{ids: [UUID]}`), `POST /api/v1/projects/{id}/designs` (`{design_ids: [UUID]}` — attach existing designs; moves a design out of any other project), `DELETE /api/v1/projects/{id}/designs/{design_id}` (detach), `PUT /api/v1/projects/{id}/designs/order`, `POST /api/v1/projects/{id}/upload` (multipart `file`, optional `title`) → creates a client-less `Design` (`source=designer_uploaded`, `client_id=None`, `business_id`), runs `ensure_can_upload` and the same size/format checks as `upload_design_image`, then stores under `designs/{business_id}/{design_id}.{ext}`; `PATCH /api/v1/projects/{id}` accepts `cover_design_id` (must belong to the project).
- Deleting a client-less design reuses the existing storage cleanup; extract the shared "store design image" body of `upload_design_image` into `services/design_images.py::store_design_image(db, business, client_id|None, file, title, description) -> Design` and call it from both routes.

- [ ] **Step 1: Failing tests:** CRUD; `test_upload_counts_toward_image_limit` (limit reached → 403); `test_attach_other_business_design_404`; `test_design_in_one_project_only`; `test_free_plan_403`; `test_reorder`.
- [ ] **Step 2–4:** Run to fail; implement (refactor first, keep existing designs tests green); pass.
- [ ] **Step 5: Commit** `feat: projects API with in-project uploads`

### Task 8: Public site endpoint

**Files:**
- Create: `backend/services/site_view.py`, `backend/services/rate_limit.py`
- Modify: `backend/routers/site.py` (public router), `backend/schemas/site.py`, `backend/main.py`
- Test: `backend/tests/test_site_public_api.py`

**Interfaces:**
- Produces: `GET /api/v1/site/{slug}` (no auth) → `SiteView` discriminated by `mode`:
  - `{"mode":"redirect","slug":str}` when the slug is an alias.
  - `{"mode":"gallery","business_name","designs":[{id,title,description,image_url,thumb_url}]}` (live `in_portfolio` designs, active clients, `PORTFOLIO_ORDER`; no hotspots).
  - `{"mode":"site","business_name","slug","logo_url","hero_url","tagline","about","services","socials","contact":{email,phone,address},"show_badge":bool,"projects":[{id,title,location,year,category,story,cover_url,designs:[{id,title,description,image_url,thumb_url,rooms}]}]}`.
- Rules: unknown slug, inactive business, unpublished **full** site → 404 `"Site not available"`. Free gallery needs only a slug (no publish step). Mode from `site_mode`. `show_badge = not (hide_badge and plan.website_remove_badge)`. Response headers `Cache-Control: public, max-age=60`. `services/rate_limit.py::allow(key: str, limit: int, window_s: int) -> bool` (in-process sliding window), 60 req/min per client IP, 429 beyond.
- `build_site_view(db, business) -> SiteView` shared with `GET /site/preview`.

- [ ] **Step 1: Failing tests:** `test_free_gets_gallery`, `test_solo_published_gets_site`, `test_unpublished_site_404_same_as_unknown`, `test_old_slug_redirect`, `test_downgrade_serves_gallery_keeps_projects`, `test_payload_has_no_hotspots_prices_or_client_fields` (assert serialized JSON lacks `hotspots`, `price`, `client`), `test_project_with_no_designs_ok`, `test_inactive_business_404`, `test_rate_limit_429`.
- [ ] **Step 2–4:** Run to fail; implement; pass.
- [ ] **Step 5: Commit** `feat: public site endpoint`

### Task 9: Frontend API layer

**Files:**
- Create: `frontend/src/lib/schemas/site.ts`, `frontend/src/lib/site.ts`, `frontend/src/lib/__tests__/site.test.ts`

**Interfaces:**
- Produces types `SiteSettings`, `Project`, `SiteView` (union on `mode`) matching Tasks 6–8 and functions: `getSiteSettings`, `updateSiteSettings`, `checkSlug(slug)`, `setSlug(slug)`, `publishSite`, `unpublishSite`, `uploadBranding(kind: 'logo'|'hero', file)`, `getPublicSite(slug)`, `getSitePreview`, `listProjects`, `createProject`, `updateProject`, `deleteProject`, `reorderProjects`, `attachDesigns`, `detachDesign`, `uploadProjectImage(projectId, file, title)`; plus pure `slugify(raw: string): string` mirroring backend `normalize_slug`.

- [ ] **Step 1: Failing vitest tests:** `slugify("  Sj Interiors! ") === "sj-interiors"`; `getPublicSite` calls `/site/sj-interiors`; `uploadBranding` posts FormData to `/site/logo`.
- [ ] **Step 2–4:** Run `cd frontend && npm test -- site` fail → implement → pass.
- [ ] **Step 5: Commit** `feat: frontend site API client`

### Task 10: Dashboard "Website" settings page

**Files:**
- Create: `frontend/src/app/dashboard/website/page.tsx`, `frontend/src/components/website/SiteProfileForm.tsx`, `SlugField.tsx`, `BrandingUploader.tsx`, `PublishBar.tsx`; add a sidebar entry in the existing dashboard nav component (find via `components/layout`).
- Test: `frontend/src/components/website/__tests__/SlugField.test.tsx`

**Interfaces:** consumes Task 9. Behavior: slug field debounced `checkSlug`, shows full URL; Free plan sees only the slug field + gallery link and an upgrade prompt for the rest; Publish/Unpublish and "Preview" (opens `/dashboard/website/preview` from Task 12); `hide_badge` toggle visible only when plan allows.

- [ ] **Step 1: Failing test:** `SlugField` shows "taken" when `checkSlug` resolves `available:false`.
- [ ] **Step 2–4:** Run → fail; implement; pass. Run `npm run lint`.
- [ ] **Step 5: Commit** `feat: website settings page`

### Task 11: Projects management UI

**Files:**
- Create: `frontend/src/app/dashboard/website/projects/page.tsx`, `frontend/src/components/website/ProjectForm.tsx`, `ProjectDesignPicker.tsx`
- Test: `frontend/src/components/website/__tests__/ProjectDesignPicker.test.tsx`

**Interfaces:** consumes Task 9. Picker lists the business's existing designs (reuse existing portfolio-designs listing in `lib/designs.ts`) plus an "Upload new" action; drag/arrow reorder reuses the pattern in `lib/portfolioOrder.ts`. Paid-only; Free sees an upgrade prompt.

- [ ] **Step 1: Failing test:** selecting two designs and confirming calls `attachDesigns(projectId, [id1,id2])`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5: Commit** `feat: project management UI`

### Task 12: Public route and gallery mode

**Files:**
- Create: `frontend/src/app/[slug]/page.tsx`, `frontend/src/app/[slug]/layout.tsx`, `frontend/src/components/site/SiteGallery.tsx`, `frontend/src/app/dashboard/website/preview/page.tsx`
- Test: `frontend/src/components/site/__tests__/SiteGallery.test.tsx`

**Interfaces:** consumes `getPublicSite`. Existing static routes (`/dashboard`, `/admin`, `/login`, `/portfolio`, `/share`, `/quotation`) win over `[slug]`. `mode:"redirect"` → `router.replace('/'+slug)`; 404 → Next `notFound()`. `mode:"gallery"` renders image grid + "Powered by Reve8" footer (reuse the `CustomerFooter` style). `mode:"site"` renders `<SiteTemplate view={view}/>` (Task 13). Set `referrer: no-referrer` and `robots: noindex` on unpublished/preview only.

- [ ] **Step 1: Failing test:** `SiteGallery` renders one image per design and the badge text "Powered by Reve8".
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5: Commit** `feat: public slug route and gallery`

### Task 13: Full-site template

**Files:**
- Create: `frontend/src/components/site/SiteTemplate.tsx`, `SiteNav.tsx`, `SiteHero.tsx`, `ProjectGrid.tsx`, `ProjectOverlay.tsx`, `ServicesSection.tsx`, `StudioSection.tsx`, `ContactFooter.tsx`
- Test: `frontend/src/components/site/__tests__/SiteTemplate.test.tsx`

**Interfaces:** consumes `SiteView` (`mode:"site"`). Sticky nav with anchor links to Projects / Services / Studio / Contact (omit a link when its section has no content); hero with logo, tagline, hero image (fallback gradient when absent); project cards open `ProjectOverlay` (full-screen, gallery, Esc/close, focus trap, story, location/year/category); contact footer with phone/email/address/socials and the firm's name/logo; "Powered by Reve8" shown when `show_badge`, linking to the Reve8 marketing site (`NEXT_PUBLIC_MARKETING_URL` from `lib/config.ts`, add to `frontend/.env_local_example`). Match Reve8 visual style from `components/landing`; mobile-first.

- [ ] **Step 1: Failing tests:** `test_sections_hidden_when_empty` (no services → no Services nav link); `test_overlay_opens_and_closes_on_escape`; `test_badge_hidden_when_show_badge_false`; `test_project_without_designs_renders`.
- [ ] **Step 2–4:** fail → implement → pass; `npm run lint && npm run build`.
- [ ] **Step 5: Commit** `feat: single-page website template`

### Task 14: End-to-end verification and docs

**Files:**
- Modify: `docs/ENV_VARIABLES.md` (new env var), `frontend/.env_local_example`
- Create: `docs/WEBSITE_PLAN_CHANGELOG.md` (short: what shipped, phase-2 custom-domain notes copied from the spec)

- [ ] **Step 1:** Run backend suite `./scripts/run-tests.sh -v` and `ruff check . && ruff format --check .` → all pass.
- [ ] **Step 2:** Run `cd frontend && npm test && npm run lint && npm run build` → pass.
- [ ] **Step 3:** Start the stack (`docker compose -f .compose/dev.yml up -d supabase-db supabase-auth dev-redis`, backend, `npm run dev`); manually: set slug on a Free business → `/<slug>` shows gallery; upgrade to Solo, fill profile, create a project with an attached and an uploaded design, publish → full site at `/<slug>`; rename slug → old link redirects; unpublish → 404; downgrade to Free → gallery.
- [ ] **Step 4: Commit** `docs: website feature notes`
