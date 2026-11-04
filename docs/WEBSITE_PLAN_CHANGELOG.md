# Designer Website: What Shipped

Branch `feat/designer-website`. Spec: `docs/superpowers/specs/2026-11-02-designer-website-design.md`.

## What shipped

- Readable public links at `/<slug>`, chosen by the designer (unique, reserved words rejected, editable).
- Free: `/<slug>` is a live image gallery of designs with `in_portfolio=true`.
- Solo / Studio / Studio Pro: `/<slug>` is a full single-page website (hero, about, services, projects, contact) with projects that open as an overlay.
- Publish flow: a new site is unpublished until the owner/admin clicks Publish; owner/admin can preview it first. Unpublished sites return 404 publicly (the Free gallery needs no publish).
- Branding upload: logo and hero image (jpg/png/webp), stored under a `branding/` media prefix. They are exempt from the image count but still capped by `max_image_mb`.
- Projects: named group of designs (title, location, year, category, story, cover). Built from existing client designs and/or images uploaded straight into the project (stored as client-less designs, counted toward `max_images` / `max_image_mb`).
- Client names, prices and hotspots never appear on the public site.
- "Powered by Reve8" badge always shown; Studio Pro can hide it (`hide_badge`).

## Plan matrix

| | Free | Solo | Studio | Studio Pro |
|---|---|---|---|---|
| Readable link | yes | yes | yes | yes |
| Public view | gallery | full site | full site | full site |
| Projects | no | yes | yes | yes |
| `website_custom_domain` flag | no | no | yes | yes |
| `website_remove_badge` flag | no | no | no | yes |

`website_custom_domain` and `website_remove_badge` exist as flags. Custom-domain mapping is NOT built yet (see Phase 2). Only the badge flag has an effect today.

## Migrations

- 0051: `designs.business_id` (backfilled from clients; default from RLS helper), `designs.client_id` made nullable. Designs whose client has no business keep a NULL `business_id`; nothing is deleted. Downgrade refuses if client-less designs exist.
- 0052: `projects` table (with RLS), `designs.project_id` / `project_position`, project `cover_design_id` FK.
- 0053: `businesses` site columns (`slug` unique, `site_published`, tagline, about, address, services, socials, `logo_path`, `hero_path`, `hide_badge`) and `slug_aliases` (old slug to business; permissive RLS since slugs are public).
- 0054: data migration turning on `website_*` flags for the `solo`, `studio`, `studio_pro` plan rows (by slug; other plans untouched).

## API

Admin (owner/admin, `/api/v1`):

- `GET /site`, `PUT /site` (profile fields, services, socials, `hide_badge`)
- `GET /site/slug-check`, `PUT /site/slug`
- `POST /site/publish`, `POST /site/unpublish`
- `GET /site/preview`
- `POST /site/logo`, `POST /site/hero`
- `DELETE /site/slug`: withdraws the public address (clears `businesses.slug`; old slugs stay as aliases but return 404 once the business has no slug). Re-claiming is allowed for the same business.

Projects (paid plans, admin):

- `GET /projects`, `POST /projects`, `PATCH /projects/{id}`, `DELETE /projects/{id}`, `PUT /projects/order`
- `GET /projects/library` (designs of the business for the picker)
- `POST /projects/{id}/designs` (attach), `DELETE /projects/{id}/designs/{design_id}` (detach), `PUT /projects/{id}/designs/order`
- `POST /projects/{id}/upload` (image straight into a project)

Public (no auth):

- `GET /site/{slug}` returns `{mode: "gallery" | "site" | "redirect"}`; unknown, unpublished or inactive returns 404 with the same body.

## Behaviour notes

- The plan is checked on every public read. A lapsed (expired) paid plan or a downgrade to Free serves the gallery.
- Downgrade keeps all content (logo, hero, text, projects); re-upgrading restores the full site.
- After a downgrade, business admins can still list projects, delete a project and remove project images (so quota can be freed); creating, uploading, attaching, reordering and editing projects need a website plan.
- Renaming a slug leaves the old one as an alias returning `{mode: "redirect"}`.
- Deleting a project, or detaching a client-less design, deletes those uploaded images and their storage objects. Client-owned designs are only unlinked.
- Old `/portfolio/<token>` links are unchanged (frozen snapshots).
- Public pages are client-rendered (no SSR/SEO in this phase).
- Public endpoint is rate limited (60 req/min per client IP, in memory per process); see `docs/DEPLOYMENT.md`.

## Phase 2: custom domains (not built)

Gated by `website_custom_domain` (Studio, Studio Pro; one domain each).

- Host-to-business lookup: resolve the request `Host` to a business before slug routing.
- Per-business link base in `public_url()` so share links use the custom domain instead of the single `FRONTEND_URL`.
- CORS: today it is a static `ALLOWED_ORIGINS` list. Either make it dynamic from the stored domains or proxy API calls same-origin.
- Vercel domain API to attach the domain, plus a DNS verification UI (show records, poll status).
- Keep `X-Frame-Options: DENY`.
