# PR Plan: Pricing, Plan Limits, Admin Plan Control, Landing Pricing Table

Next PR after `feat/inbox`. Website builder is the PR after this one; this PR only reserves room for it.

## Status

Done on `feat/pricing-plans`:

- Plans table, seed, effective limits, enforcement on create actions, AI credits (migration 0048).
- Admin plans page, business plan and override controls, landing pricing table.
- One admin-set chat model per business; the user-facing tier picker is gone (migration 0049).
- Tenant usage meters (settings) and an upgrade nudge when a limit is at 80%+.

- Razorpay: monthly subscriptions, yearly one-time orders, signed webhook, Billing page, admin plan sync, optional first-month offer (migration 0050).

Not started: clean/branded export gating, audio credits, automatic drop to Free after a lapsed period.

## Goals

- Four plans (Free / Solo / Studio / Studio Pro) defined in the database, not in code.
- Razorpay payments so a business can upgrade itself: monthly via Subscriptions (UPI Autopay and cards), yearly via a one-time Order.
- Platform admin edits plans (price, limits, features) and assigns a plan to a business.
- Limits are enforced on create actions and shown as usage meters.
- AI becomes credits per month; users no longer pick a model.
- Landing page pricing table reads the same plan data.
- Website-builder limits and flags exist in the schema now, switched off.

## Non-goals (deferred)

- GST invoicing and Tally/GSTR export. Not GST-registered yet, so prices carry no GST and Razorpay receipts are enough.
- Proration on mid-cycle plan changes, refunds from the admin UI (done in the Razorpay dashboard).
- The website builder itself (templates, renderer, domains).
- Credit top-up packs, email/WhatsApp expiry reminders.
- Scheduled downgrade jobs; downgrades follow Razorpay webhooks (see Payments).

## Plan catalogue (seed values)

| | Free | Solo | Studio (Recommended) | Studio Pro |
|---|---|---|---|---|
| Monthly price (INR, no GST) | 0 | 499 | 999 | 2,499 |
| Yearly price | – | 4,990 | 9,990 | 24,990 |
| Team members | 1 | 3 | 10 | unlimited |
| Active clients | 3 | 25 | unlimited | unlimited |
| Quotation versions per quotation | 2 | 10 | unlimited | unlimited |
| Uploaded images | 20 | 300 | 3,000 | 12,000 |
| Max image size (MB) | 5 | 8 | 10 | 15 |
| Portfolio designs | 10 | 50 | unlimited | unlimited |
| AI credits / month | 10 | 50 | 200 | 600 |
| Clean (unwatermarked) export | no | yes | yes | yes |
| Branded export (own logo, no footer) | no | no | no | yes |
| Bulk materials import | no | no | no | yes |
| Priority support | no | no | no | yes |

Reserved for the website builder (seeded now, all off / zero):

| | Free | Solo | Studio | Studio Pro |
|---|---|---|---|---|
| `website_enabled` | no | no | no | no |
| `website_templates` | 0 | 0 | 0 | 0 |
| `website_max_pages` | 0 | 0 | 0 | 0 |
| `website_custom_domain` | no | no | no | no |
| `website_remove_badge` | no | no | no | no |

The website PR flips these values in a data migration; no schema change needed.

AI credit rule: 1 credit = 1 meeting-note extraction; audio transcription costs 1 credit per 10 minutes (rounded up). Numbers above are starting points, editable from admin without a deploy.

## Data model

New table `plans`:

- `id`, `slug` (unique: `free|solo|studio|studio_pro`), `name`, `tagline`, `is_public` (shown on landing), `is_recommended`, `sort_order`
- `price_monthly_inr`, `price_yearly_inr` (integers, nullable for Free)
- Limits (nullable int = unlimited): `max_users`, `max_clients` (active only), `max_quotation_versions`, `max_images`, `max_image_mb`, `max_portfolio_designs`, `ai_credits_monthly`. Storage in MB is dropped: image count plus per-image size cap is what the code already enforces
- Feature flags (bool): `clean_export`, `branded_export`, `bulk_materials_import`, `priority_support`
- Website reservations: `website_enabled`, `website_templates`, `website_max_pages`, `website_custom_domain`, `website_remove_badge`
- Display: `highlights` (JSON list of marketing bullets for the pricing card)

Changes to `businesses`:

- `businesses.plan` stays the link, now holding a plan slug (widened to 32 chars; migration maps `pro` -> `studio`). No FK: built-in plans work even before the table is seeded, and a legacy `pro` slug is aliased to `studio` in code.
- Existing `max_users`, `max_images`, `max_image_mb` become nullable per-business overrides. Effective limit = override if set, else the plan's value.
- Add `ai_credit_bonus` (int, default 0) for admin goodwill credits.
- Add billing columns: `razorpay_customer_id`, `razorpay_subscription_id`, `billing_cycle` (`monthly|yearly`; for yearly, `current_period_end` is the paid-until date), `subscription_status` (`none|created|active|pending|halted|cancelled|completed`), `current_period_end`.

New columns on `plans`: `razorpay_plan_id_monthly` (created once per plan in Razorpay, stored here). No yearly plan id: yearly uses one-time Orders, so `price_yearly_inr` is the charge amount.

New table `payment_events` (idempotency and audit): `id`, `razorpay_event_id` (unique), `event_type`, `business_id` (nullable), `payload` (JSON, no card data), `processed_at`.

Implementation notes:

- Explicit columns, not a JSON blob, so limits are typed, indexed and migration-safe. The website PR adds columns the same way.
- Seed via Alembic data migration; plan rows are editable afterwards.

## Backend

New `backend/services/plan_limits.py`:

- `effective_limits(business) -> PlanLimits` (Pydantic): plan values merged with business overrides.
- `ensure_within(business, db, limit_key)` raises 403 with a clear upgrade message; one function per resource wraps it:
  - active clients (`routers/clients.py` create)
  - quotation versions per quotation (`routers/quotation_versions.py` create)
  - designs (`routers/designs.py` create)
  - portfolio projects (portfolio create path)
  - team members (replaces the check in `services/team.py`)
  - storage (replaces `services/image_quota.py` count with bytes used; keep per-image size cap)
- `usage_summary(business, db) -> list[UsageMeter]` (`key`, `label`, `used`, `limit`) for the UI.

Changes to existing code:

- `services/ai_access.py`: replace `FREE_PLAN_MONTHLY_EXTRACTIONS` and the `plan != "free"` branch with `ai_credits_monthly + ai_credit_bonus`; count credits from `AgentAuditLog` (extractions = 1, transcription = ceil(minutes / 10)).
- `services/ai_models.py`: remove tier selection from user flows. One admin-set chat model per business, falling back to a platform default. Remove `model_options` and the tier picker from the meeting-note UI; keep price catalogue for the admin page.
- `routers/checkpoint_ai.py`: drop the tier request param; keep cost logging.
- Migration to collapse `openai_model_economy/balanced/premium` into a single `openai_chat_model` (copy the balanced value).
- `services/subscription.py`: unchanged countdown behaviour; `AccessStatus` gains plan slug/name.
- Exports: watermark unless `clean_export`; branded footer rules by `branded_export`.

New/changed endpoints (all under `/api/v1`, with Pydantic request/response models):

- `GET /plans/public` -> public, cached; plans where `is_public`, ordered by `sort_order`. No auth.
- `GET /admin/plans`, `POST /admin/plans`, `PATCH /admin/plans/{id}`: platform-admin only. Block deleting a plan that has businesses.
- `PATCH /admin/businesses/{id}`: accept `plan` (slug, validated), override fields, `ai_credit_bonus`.
- `GET /auth/me` (existing): include `plan`, `limits`, `usage` so the frontend needs one call.

## Payments (Razorpay)

Approach: Razorpay Subscriptions. Checkout opens in the browser, the backend is the only place that talks to Razorpay with the secret key, and webhooks are the source of truth for plan state.

Config (pydantic-settings, add to `.env_example` and `docs/ENV_VARIABLES.md`): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Only the key id reaches the frontend. Payments are disabled with a clear message when keys are missing, so dev and tests still run. Use test-mode keys in dev.

Backend (`services/billing.py`, `routers/billing.py`, `schemas/billing.py`):

- Plan sync: admin action "Sync to Razorpay" creates the monthly Razorpay plan for a paid plan and stores its id. Yearly needs no Razorpay plan. Razorpay plans are immutable, so a price change creates new Razorpay plans; existing subscribers keep their old price until they switch (this is also how the founding-price lock works).
- `POST /billing/checkout` (tenant admin): body `plan_slug`, `billing_cycle`. Creates or reuses the Razorpay customer, then returns what Checkout needs: monthly -> a Subscription (`subscription_id`); yearly -> a one-time Order (`order_id`, amount read from the plan row on the server, never from the request). Only the key id goes to the frontend. No GST line until the business registers; adding it later is a price-calculation change in this one function.
- `POST /billing/verify` (tenant admin): verifies the Checkout signature (`razorpay_payment_id|subscription_id`, HMAC-SHA256) and marks the subscription `created`; activation itself still comes from the webhook.
- `POST /billing/cancel` (tenant admin): cancels at cycle end; plan stays until `current_period_end`.
- `GET /billing/status` (tenant admin): plan, cycle, status, next charge date, last payments (from Razorpay, no stored card data).
- `POST /webhooks/razorpay` (public, signature-verified against the raw body): idempotent via `payment_events`. Handles:
  - `subscription.activated` / `subscription.charged`: set `plan` (slug) from the subscription's plan, `subscription_status=active`, `current_period_end`, and extend `access_expires_at` to the period end.
  - `subscription.pending` / `subscription.halted`: status only; grace period starts (access continues for `warning_days`, then existing 402 behaviour).
  - `subscription.cancelled` / `completed`: keep access until `current_period_end`, then drop to Free (data stays, creation blocked over limits).
  - `payment.captured` / `order.paid` (yearly orders): set plan, `billing_cycle=yearly`, `current_period_end = max(now, current end) + 365 days`.
  - `payment.failed`: log and flag on the admin business view.
- Webhook handler returns 200 for unknown events and never raises on duplicates; unknown subscriptions are logged and ignored.
- All Razorpay calls go through one thin client wrapper with retry and timeouts, so it can be mocked in tests; errors surface as friendly messages, never raw API text.

Yearly billing (decided): a one-time Order, not a Subscription. UPI Autopay debits are capped (generally ₹15,000), so ₹24,990 would not fit, and one flow for every yearly plan is simpler and avoids mandate failures. Renewal is manual: reminders at 30, 7 and 1 days before expiry link to the Billing page; renewing extends from the current end date, not from today. Monthly stays on Subscriptions so it auto-renews.

Security:

- Card, UPI and bank details never touch our servers or database; Razorpay Checkout is hosted by Razorpay.
- Amounts and plan ids are always read server-side from the `plans` row; the client only sends `plan_slug` and `billing_cycle`.
- The secret key and webhook secret live in env only, never logged or returned. The webhook signature is verified on the raw body with a constant-time compare, and the checkout signature is verified before anything is marked paid.
- A payment grants access only after the webhook confirms it; the verify endpoint alone never upgrades a plan.
- Webhook handling is idempotent and leaks no details in responses; billing endpoints are limited to tenant admins and rate-limited.

Trials: the 14-day Studio trial stays internal (`access_expires_at`, no card). The trial banner links to checkout; paying converts the business to the chosen plan immediately.

Admin overrides: the platform admin can still set plan and `access_expires_at` by hand for offline or UPI-transfer clients (manual mode). Manual changes are not overwritten unless the business has an active subscription.

Tenant UI: new Billing page (current plan, usage, next charge, change plan, cancel, payment history link). Upgrade buttons and the pricing table CTAs for logged-in users open Razorpay Checkout; logged-out visitors go to sign-up/request access first.

## Admin UI (`frontend/src/app/admin/(panel)`)

- New `plans` page: table of plans, edit form for price, limits (blank = unlimited), flags, highlights, public/recommended toggles, sort order. Website fields shown disabled with a "coming soon" note.
- Business detail: plan dropdown, per-business override fields (blank = use plan), AI credit bonus, current usage vs limit.
- Business list: plan pill uses plan name.
- Plan editor: "Sync to Razorpay" button and the stored Razorpay plan ids.
- Business detail: subscription status, cycle, next charge, recent payment events, and a manual-mode note when no subscription exists.

## Tenant UI

- Usage meters (e.g. "Clients 3 of 3") in settings and next to create buttons; upgrade nudge at 80%, blocking message at 100%.
- Remove the model tier picker from meeting-note extraction; show "AI credits: 7 of 10 left".
- Upgrade call-to-action opens the Billing page / Razorpay Checkout.
- Over-limit state after a downgrade: existing data stays viewable and editable; only creating new items is blocked.

## Landing page pricing table

- New `components/landing/PricingTable.tsx`, server component fetching `GET /plans/public`; added to `app/page.tsx` before the final call-to-action.
- Monthly/yearly toggle (client component); yearly default, shown as "2 months free" with per-month equivalent.
- Highest tier visually anchors the row; the recommended plan carries a badge and emphasis.
- Free card CTA -> sign-up/request access; paid CTAs -> sign-in then Billing checkout for tenants (request access for new visitors). Prices shown in INR with no GST line.
- Comparison rows come from `highlights` plus a fixed row set (team, clients, AI credits, storage).
- Falls back to a static message if the API fails; the landing page must still render.
- Light and dark theme and phone width checked.

## Rollout / migration order

1. Alembic: create `plans`, widen/migrate `businesses.plan`, make limit columns overrides, add `ai_credit_bonus`. Plans are seeded on API startup (and lazily by the plans endpoints), never overwriting admin edits. Model-column collapse happens with the AI picker removal.
2. Backend services and routers; keep old `plan` column readable.
3. Admin plans page and business detail updates.
4. Tenant meters, AI credit display, picker removal.
5. Landing pricing table.
6. Razorpay: config, client wrapper, plan sync, checkout/verify/cancel, webhook, Billing page. Build it behind missing-key fallback so earlier steps ship without it.
7. Follow-up PR: drop the old `plan` string column.

Existing client: assign a Studio-equivalent plan with a founding-price note so nothing they use is cut off.

## Tests

- Unit: `effective_limits` (plan only, override wins, null = unlimited), credit counting, audio rounding.
- API: each create endpoint returns 403 at the limit and succeeds under it; admin plan CRUD (auth, validation, delete blocked); public plans endpoint hides non-public plans.
- Regression: update `test_ai_quota.py`, `test_image_quota.py`, `test_team_api.py`, `test_businesses_api.py` to the new sources of limits; remove tier tests.
- Billing: signature verification (valid, tampered, missing), webhook idempotency (replayed event ignored), each event type moves plan/status/dates correctly, cancel keeps access until period end, missing keys disable checkout without errors. Razorpay client mocked throughout.
- Frontend: pricing table render with mocked plans; fallback state; Billing page states.

## Open questions

- Final prices and limits (current numbers are starting points).
- Does "active clients" exclude archived/closed clients? Needs a definition in code.
- Storage: count original uploads only, or also generated WebP variants?
- Confirm in the Razorpay dashboard that Subscriptions and UPI Autopay are enabled and what the per-debit cap is (generally ₹15,000 without extra authentication; do not assume more).
- When GST registration happens (mandatory above the turnover threshold), decide inclusive vs exclusive pricing and invoice issuing.
- Should a downgrade ever delete or hide data? Proposal: never, only block creation.

## Website builder hooks (next PR)

- Plan flags above gate templates, page count, custom domain and badge removal.
- `effective_limits` already exposes them, so the builder only reads limits.
- Domain add-on and setup service can reuse the same checkout with a one-time Razorpay order.
- Contact-form leads reuse the client creation path and therefore the active-clients limit; decide in that PR whether website leads bypass it.
