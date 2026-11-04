# Designer Website — Design

## Intent
Designers currently share a portfolio as a snapshot link (`/portfolio/<random-token>`) showing a bare list of images and only the business name. In interior design, how work is presented is part of the sale. Each designer should be able to share a link that looks like their own website: logo, hero, about, services, in-depth projects, contact details and their firm's footer, with "Powered by Reve8" at the bottom. Links should be human readable. Mapping a designer's own domain to the site is wanted, but later.

## Goals
- A permanent, per-business public site at a readable link `/<slug>` (e.g. `/sj-interiors`).
- One polished template in Reve8's visual style: single page, sticky nav that scrolls to sections (Projects, Services, Studio/About, Contact).
- Designer-managed content: logo, hero image + tagline, about, services, phone, email, address, social links.
- Projects: named groups of designs with in-depth detail, opened in an on-page overlay.
- Plan gating (below), reusing the reserved `website_*` fields on `Plan`.
- Phase 2: custom domain mapping.

## Non-goals
- Multiple templates, free-form colour editors, multi-page sites (six preset themes shipped 2026-11-03) (the plan table's `website_templates` / `website_max_pages` stay unused).
- Custom domains in phase 1.
- Contact/enquiry forms with submission handling (phase 1 uses mailto/tel/links only).
- SEO tooling, analytics, blog.

## Anti-goals (failure even if it works)
- Client names, prices or any private client data appearing on a public site.
- Breaking existing `/portfolio/<token>` links.
- Letting free users bypass image/portfolio limits through the new project upload path.

## Product decisions (made by the user unless marked)
- **Project** = a named group of designs: title, location, year, category, short story, cover image. Its gallery is the designs inside. Opens as an overlay on the same page.
- Projects can be built from existing client designs *and* from fresh images uploaded straight into the project. Fresh uploads are stored as designs with no client (same image pipeline and quotas). *(Mechanism is my guess.)*
- Client names and prices are never shown. *(My guess, stated to and not contradicted by the user.)*
- Slug is chosen by the designer, unique, readable; warned if taken. *(My guess.)*
- Free users: readable link `/<slug>` showing the simple image gallery (today's behaviour), badge always shown. Old token links keep working.
- Plan matrix (my recommendation, accepted by user):

| | Free | Solo | Studio | Studio Pro |
|---|---|---|---|---|
| Readable link | yes | yes | yes | yes |
| Simple gallery | yes | no (full site) | no | no |
| Full website | no | yes | yes | yes |
| Custom domain (phase 2) | no | no | 1 | 1 |
| Badge | always | always | always | removable, default on |

## What exists today (from codebase recon)
- `Design` (title, description, rooms, `in_portfolio`, `portfolio_position`, `storage_path`, hotspots) belongs to a client; no Project table.
- `PortfolioShare` is a token + `design_ids` snapshot; public endpoint `GET /api/v1/portfolio/{token}` (no auth), page `frontend/src/app/portfolio/[token]`.
- Images are private; served via HMAC-signed `/api/v1/media/{path}` URLs, only for paths under `designs/`. Logo/hero need a new allowed prefix.
- `Business` has no logo/about/slug fields; `contact_email`/`contact_phone` exist.
- `Plan` has reserved `website_enabled`, `website_templates`, `website_max_pages`, `website_custom_domain`, `website_remove_badge` (all off in seeds). Seeded plans: free, solo, studio, studio_pro.
- Public routers skip `get_current_user`, so no RLS scope; they must filter by `business_id` explicitly. Alembic head is `0050`.
- Deployment: Vercel frontend, Render backend; CORS is a static env list; `public_url()` uses one `FRONTEND_URL`.

## Constraints
- Follow repo conventions in `CLAUDE.md` (FastAPI + SQLAlchemy + Alembic, Next.js under `frontend/src`, all API calls through `lib/`, ruff).
- Respect existing image quotas (`max_images`, `max_image_mb`, `max_portfolio_designs`).
- Public site data must come from explicit, whitelisted fields; no accidental leakage.
- `X-Frame-Options: DENY` stays.

## Phase 2 notes (not for phase 1 build)
Host-to-business lookup, per-business link base in `public_url()`, dynamic CORS or same-origin proxying, Vercel domain API + DNS verification UI, gated by `website_custom_domain`.

## Answers from builder-check round (accepted by the user)
- **Free gallery** at `/<slug>` is live: it shows designs with `in_portfolio=true`. Old `/portfolio/<token>` links remain frozen snapshots. `in_portfolio` is kept and drives only the free gallery.
- **Downgrade/expiry:** all site content (logo, hero, text, projects) is retained. The public endpoint checks the plan on each read; below Solo it serves the simple gallery. Re-upgrading restores the full site.
- **Quotas:** every project image is a design (client-less allowed) and counts toward `max_images` / `max_image_mb`. Logo and hero are exempt from image quotas. Free users cannot create projects.
- **Public fields:** project title/story/location/year/category and design title, description and rooms may appear. Hotspots, prices, client names and anything client-linked never appear. Designers write project text themselves.
- **Publishing:** a new site is unpublished until the designer clicks Publish; a preview is available to the owner/admin. Unpublished sites return 404 publicly (the free gallery is unaffected).

## Calls made by the author (minor, not discussed with the user)
- A design belongs to at most one project (nullable `project_id`-style relation); `in_portfolio` keeps driving the free gallery only.
- Slug is editable; the old slug redirects to the new one. Reserved words (`admin`, `client`, `portfolio`, `share`, `quotation`, `dashboard`, `login`, `api`, etc.) are rejected. A business without a slug has no readable link.
- Only owner/admin roles of the business can edit site content, via a single "Website" settings page that includes project management.
- "Powered by Reve8" links to the Reve8 marketing site. Studio Pro gets a per-business toggle to hide it.
- Logo/hero: jpg/png/webp only (no SVG), served through the existing signed-media mechanism under a new `branding/` prefix; stable-URL/TTL handling is the builder's call.
- Public site endpoint gets basic rate limiting and short-lived caching.

## Left to the builder
- Schema shape (new `Project`/`ProjectDesign` tables vs. columns), slug validation and reserved words, migration of existing `in_portfolio` data (seed vs. drop), media-prefix design for logo/hero/no-client designs, endpoint and component structure, visual details inside the Reve8 style, empty-state handling for new sites, tests.
