# Custom Domains for Designer Websites — Design (Phase 2)

## Intent
Phase 1 gave each business a site at `/<slug>`. Designers on Studio and Studio Pro (`Plan.website_custom_domain`) should serve that same site from their own domain (e.g. `www.sjinteriors.com`), so the site reads as their firm's own.

## Goals
- A paid business attaches one custom domain, verifies DNS, and the site is served there over HTTPS.
- The site on the custom domain is the exact phase 1 renderer (published site, or gallery fallback on downgrade).
- Domain status (pending / verified / live / error) is visible in the Website settings page with the exact DNS records to add.
- Removing the domain, unpublishing or downgrading stops serving it.

## Non-goals
- Multiple domains per business (plan flag is a boolean; one domain).
- Apex-domain-first support; we recommend `www` and tell users to redirect the apex at their registrar.
- Registrar integrations / buying domains / email hosting.
- SSR/SEO work (separate item; custom domains make it more valuable).
- Wildcard or subdomain-of-reve8 hosting.

## Anti-goals (failure even if it works)
- One business claiming a host and serving another business's data, or hijacking a host that is not theirs (unverified domains must never serve).
- Claiming reve8's own hosts or app hostnames (`FRONTEND_URL` host, `*.vercel.app`, localhost).
- Serving the dashboard, admin or API-authenticated pages on a customer domain.
- Breaking `/<slug>` links or the phase 1 plan fallback.

## Product decisions
- One domain per business, Studio and Studio Pro only. *(From the phase 1 plan matrix, accepted by the user.)*
- Recommend `www.<domain>`; apex shown as a secondary option with a note. *(My call.)*
- `/<slug>` keeps working after a domain goes live and does not redirect. *(My call, avoids breaking shared links.)*
- On the custom domain only the site renders at `/`; every other path 404s. *(My call.)*

## Approach (my calls)
- **Host registry:** new `business_domains` table: `id`, `business_id` (unique, one per business), `host` (unique, lowercase), `verification_token`, `status` (`pending|verified|error`), `last_checked_at`, `created_at`. RLS like other business tables; public lookup is by explicit query.
- **Provider:** Vercel Domains API (project-scoped) attaches and removes the host and reports verification/config state. Behind a small `DomainProvider` interface with a `VercelDomainProvider` and a `FakeDomainProvider` for tests and local dev. Env: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (optional). When unset, the feature reports "not configured" instead of failing.
- **Verification:** the backend polls the provider on demand (a "Check now" button and when the settings page loads while pending). No background worker in phase 2.
- **Serving:** Next.js `middleware.ts` rewrites requests whose `Host` is not the app host to an internal route `/_domain/<host>`; that route resolves the host via a public API call and renders the phase 1 site components. Unknown or unverified hosts render a neutral 404.
- **API access:** the existing `/api/:path*` rewrite proxies through the Next app, so the custom domain's browser calls are same-origin and CORS needs no change.
- **Public lookup:** `GET /api/v1/site/by-host/{host}` returns the same discriminated `mode` payload as `/site/{slug}`; only verified domains resolve; plan gating via `site_mode`; same rate limit.
- **Links:** `public_url` for the business's site returns `https://<verified-host>` when verified, else the slug URL. Share/portfolio token links are untouched.
- **Reserved hosts:** reject hosts equal to or under the app host, `localhost`, IP literals, `*.vercel.app`, and hosts already claimed.

## Constraints
- Follow `CLAUDE.md` (FastAPI/SQLAlchemy/Alembic, Next under `frontend/src`, API calls via `lib/`, ruff).
- Alembic head is `0055`; the new migration follows it.
- Only business owner/admin roles manage the domain.
- `X-Frame-Options: DENY` stays.
- No secrets in the frontend; the Vercel token is backend-only.

## Left to the builder
- Exact Vercel API calls and response mapping, DNS record copy in the UI, migration details, error states, middleware matcher details, tests.

## Open items to confirm at deploy
- Vercel plan limit on domains per project.
- Whether the Vercel project needs the API token scoped to a team.
