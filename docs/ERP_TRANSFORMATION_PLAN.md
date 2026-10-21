# Transformation Plan: Quotation Engine → AI-First Business OS (Lightweight ERP) for German Consultants & SMBs

> **Verdict: Yes, this is feasible — and well-timed.** The existing codebase contributes ~40% of the core machinery (dynamic columns, checkpoint merge/diff/versioning, AI document extraction, audit logging). The German E-Rechnung mandate (2025–2028) is forcing every SMB into structured-data tooling *right now*, and no incumbent in the €10–40/mo class ships AI on the revenue side (document → quotation). This document is the full analysis and phased plan.

*Prepared: 2026-08-06 · Base: `interior-designer-portal` @ `feat/show_quotation_diffs_and_improve_checkpoints`*

---

## 1. What "ERP" means here (scope definition)

Full ERP (SAP-style: manufacturing, HR, warehouse) is not the target and would be a mistake for a solo-built product. The target is what the German market calls **Büro-/Auftragssoftware with ERP-lite depth** — the operational spine of a service business:

```
Inbound document (RFQ / email / tender / notes / audio)
        │  AI intake
        ▼
Quotation (Angebot)  ──follow-up──►  Order (Auftrag)
        │                                │
        ▼                                ▼
Delivery note / activity record   Invoice (Rechnung: XRechnung / ZUGFeRD / PDF)
                                         │
                                         ▼
                          GoBD archive · DATEV export · Dashboard/cash-flow
```

**Target customers:** consultants/Freiberufler and service SMBs (10–50 employees) in Germany. Not manufacturing, not retail inventory (v1).

---

## 2. Pain-point analysis (what consultants & SMB owners actually struggle with)

### Time & process pain (quantified)
| Pain | Evidence |
|---|---|
| Bureaucracy consumes ~7% of total working time (~32 h/month per Mittelstand firm) | KfW Research Nr. 495, Apr 2025 |
| A quotation takes 45–55 min manually (find old quote, adapt, format, PDF, send) | Proposal Air (DE market data) |
| Only 30–40% of quotations convert; profitable businesses need >50%; ~80% of orders close after the 2nd–5th contact — yet most SMBs have **no systematic follow-up** | elektro.net, Bosch OfficeOn, turboangebot.de |
| Tender/RFQ documents (Leistungsverzeichnis/GAEB) must be parsed manually → firms bid on fewer tenders than they could | Tendermeister, SHK Profi |
| Owners don't know which fields make an invoice legally valid (§14 UStG); fear of Finanzamt errors | Qonto, heise tool comparisons |

### Pain with incumbent tools (from reviews)
- **sevDesk**: two price hikes (2024, 2025 → €29.90/mo mid-tier), OCR errors, chart-of-accounts regressions, limited tax-advisor access.
- **lexoffice**: no cost centers, Ist-/Soll-Versteuerung switching problems, shallow quoting.
- **weclapp**: per-user pricing "more than doubled"; €39–179/user/mo stacks fast.
- **Odoo**: German localization + DATEV practically requires a paid implementation partner.

### The structural gap
Incumbents digitize the *cost* side (receipt OCR, bookkeeping suggestions). **Nobody in the SMB price class automates the *revenue* side** — turning an inbound document into a priced quotation, following it up, and flowing it into a compliant invoice. That is exactly the pipeline this codebase already prototypes (checkpoint → extraction → merge → quotation).

---

## 3. Regulatory landscape (the moat — verified 2025/2026 status)

This is where German business tools live or die, and it's a *tailwind*: regulation forces adoption.

| Requirement | Status / deadline | Implication for us |
|---|---|---|
| **E-Rechnung receive duty** (B2B, all businesses incl. Kleinunternehmer) | In force since **1 Jan 2025** | Must *parse* inbound XRechnung/ZUGFeRD — conveniently also an AI-intake feature |
| **E-Rechnung issuance duty**, turnover > €800k | **1 Jan 2027** | Invoice module must emit EN 16931 XML from day one |
| **E-Rechnung issuance duty, everyone** | **1 Jan 2028** | Same |
| Accepted formats | **XRechnung** (pure XML), **ZUGFeRD ≥ 2.0.1** (PDF/A-3 + embedded XML) | Generate both from one internal invoice model |
| **§14 UStG mandatory invoice fields** | Re-drafted 1 Jan 2025 | Validation layer: names/addresses, Steuernummer/USt-IdNr, sequential invoice number, service date, net per rate, 19%/7%, exemption notes |
| **§19 Kleinunternehmerregelung** | Reformed 2025: €25k prior-year / €100k current-year, **immediate** VAT switch when exceeded mid-year | Onboarding flag + threshold monitoring (incumbents handle this poorly — differentiator) |
| **Reverse charge §13b / innergemeinschaftlich** | Standing | Tax-code per line item, note on document |
| **GoBD** | Standing; retention now 8 years for invoices (from 2025) | Immutability: issued documents are append-only; every change logged with user + timestamp. Our `audit_log` + snapshot architecture is already shaped for this |
| **DATEV export** | De-facto mandatory (accountant interface) | CSV/Buchungsstapel export first; DATEV-Schnittstellen certification later |
| **ViDA** (EU digital reporting) | From **1 Jul 2030** cross-border | Structured invoice data now = future-proof |

---

## 4. Competitor landscape & positioning

| Tool | Segment | Price | AI today |
|---|---|---|---|
| Lexware Office (lexoffice) | freelancer–small SMB, ~230–350k customers | from €7.90/mo | bookkeeping suggestions only |
| sevDesk | self-employed/SMB, 150k+ | €12.90–29.90/mo | receipt OCR ("sevKI") |
| easybill | e-commerce | from €7.50/mo | minimal |
| Papierkram / FastBill / Billomat | freelancers | low €/mo | minimal/none |
| weclapp | SMB full ERP | €39–179/user/mo | light |
| Odoo | any, modular | ~€19.90/user/mo + partner costs | generic, not DE-compliance-aware |
| Plancraft / HERO (trades vertical, Plancraft €38M Series B 2025) | construction only | mid | marketing "KI-Features"; only ~4% of trades firms actively use AI |
| Scalera / Tendermeister / Vergabepilot / BidFix | enterprise tender AI | high | strong doc-intake AI, wrong segment |

**Whitespace:** AI-first, compliance-native, **revenue-side** tool for consultants + service SMBs at **€15–35/mo**, between the bookkeeping incumbents (no quotation AI) and the enterprise tender-AI startups (wrong price class), not vertical-locked like Plancraft.

**Positioning sentence:** *"Send us anything — an email, a tender PDF, a voice note, a meeting transcript — and get back a priced, compliant German quotation in minutes. When it's won, the invoice, e-invoice XML, GoBD archive and DATEV export are one click."*

---

## 5. Where AI shines (opportunity map)

Ranked by (evidence of value × fit with existing code):

1. **Document intake → structured line items** ★ core differentiator
   - Already working for audio/transcript/image (`checkpoint_agent.py`, `transcription.py`, materials vision extract). Extend to: PDF (RFQs, old quotations, inbound invoices), email text, DOCX, XLSX (generalize the hardcoded importer), later GAEB/LV.
   - Scalera claims "up to 60% less quoting effort" with exactly this; validates the category.
2. **Price suggestion from history** — "you quoted 'Konzeptworkshop' at €1,400 for the last 3 clients." Needs quote history + embedding/similarity over line descriptions. High wow-factor, moderate effort.
3. **Automated follow-up (Nachfassen)** — AI-drafted follow-up emails on a schedule tied to quotation status. Directly attacks the 30–40% conversion problem; measurable ROI; **no incumbent has it**.
4. **Multilingual document generation** — same quotation rendered in DE/EN/PL/TR (see §7). The E-Rechnung XML stays language-neutral (EN 16931 semantics), so multilingual presentation + German fiscal payload is technically clean. No incumbent does AI-multilingual documents.
5. **Inbound e-invoice/receipt extraction** — table stakes (Candis, sevKI exist), but needed anyway for the 2025 receive-duty.
6. **Change-tracking narrative** — the existing checkpoint/"What Changed" engine is genuinely novel: "client asked for X in the call on Tuesday → here's the delta to the quotation." Reframe as **negotiation history / revision audit trail** — consultants love defensible paper trails.
7. **Cash-flow forecast (later)** — Agicap proves demand but prices above SMBs; a lightweight forecast from open invoices + recurring costs is a v3 feature.

**Compliance framing for AI (important for the PwC audience):** every AI extraction lands as a *draft* the user confirms (the checkpoint verify-then-add flow already implements human-in-the-loop); `agent_audit_log` already records model, tokens, latency, hashed inputs. This "AI proposes, human approves, everything audited" story is exactly what a compliance-minded reviewer wants to hear — keep it front and center.

---

## 6. Asset inventory: what carries over vs. what must change

### Reusable as-is (the ~40%)
| Asset | Why it matters |
|---|---|
| Dynamic column engine (`services/column_settings.py`, `app_settings`, `extra` JSONB) | Generic custom-fields system — consultants and trades need different line-item shapes; this is the flexibility story |
| Checkpoint → merge → diff → snapshot pipeline (`checkpoint_merge.py`, `quotation_diff.py`, snapshots JSONB, LIFO revert) | Deterministic, tested, LLM-free versioning core; becomes "negotiation history" |
| AI extraction pipeline (PydanticAI typed outputs, Whisper, vision) | The intake engine; just needs new document types + prompt templates |
| `audit_log` + `agent_audit_log` (PII-hashed) | GoBD/compliance logging foundation |
| Layering discipline (thin routers, services, `lib/api.ts`, derived-not-stored totals) | Clean base to extend |
| Docker/compose/CI setup, Alembic migrations | Ops carry-over |

### Must be generalized (domain surgery)
| Coupling | Change |
|---|---|
| `room` is a mandatory locked column and merge identity | Rename concept to configurable **group** ("Raum" / "Projektphase" / "Leistungsbereich" / "Cost center") — touches merge, diff, export, both grids |
| `₹`/INR hardcoded incl. in backend column labels; `en-IN` locales | Tenant-level currency + locale; EUR/`de-DE` default; kill hardcoded symbols |
| `dimension_parser.py` (feet/inches → sqft) | Metric parser: m², lfm, Stk, Std, Tag, pauschal; keep imperial behind a unit-system setting |
| Interior-design enums (`ProjectPhase`, `core_works/loose_furniture`) | Configurable pipeline phases per tenant; generic item categories |
| AI prompt hardcoded "Indian interior design firm", model id hardcoded | Prompt templates on disk per document-type × language; model from settings |
| `Quotation` 1-per-client, 409 on second | Client → many **projects** → many documents (quotation versions, orders, invoices) |
| Excel importer hardcoded to one workbook | Generic mapper (AI-assisted column mapping) |
| `DEFAULT_LINE_ITEM_COLUMNS` duplicated in Python + TS | Single source: backend serves column defs; frontend consumes |

### Must be built from zero
Invoicing (model, numbering, §14 validation), VAT engine, PDF generation, XRechnung/ZUGFeRD emission, i18n, multi-tenancy, user management/roles, email sending, DATEV export, GoBD immutability rules, customer/product catalogs.

---

## 7. Multi-language strategy

**Two independent axes — don't conflate them:**
1. **UI language** (operator-facing): `next-intl` on the frontend; all strings to message catalogs. Backend error messages via a message-key layer. Start **DE + EN**.
2. **Document language** (customer-facing): per-document setting. Templates (labels, payment terms, legal notes) as translation files; free-text line descriptions translated **by LLM on demand with side-by-side review** (never silent auto-translation on a legal document — the human confirms, consistent with the guardrail posture).

**Language priority (evidence-based):** DE + EN at launch → **Polish, Turkish, Russian/Ukrainian** next. Migrant founders = ~28% of German business foundings (2024, ifo/KfW); Polish-origin entrepreneurs are now the largest group (~87k businesses), Turkish-origin close behind. Incumbents offer only static manual template translation (easybill) — AI-assisted multilingual documents are genuinely unoccupied ground.

**Fiscal note:** the XRechnung/ZUGFeRD XML payload is language-neutral by EN 16931 semantics — only the human-readable rendering varies. German legal notes (§19, §13b) must appear in German regardless of document language (render bilingually).

**AI prompts** must become language-parametric (extraction works on German input; generation targets the document language) — one more reason to move prompts from code to templates.

---

## 8. Additional features that make the tool valuable (beyond core flow)

Ranked by value-to-effort for this segment:

1. **Quotation → invoice one-click conversion** (incl. partial invoicing / Abschlagsrechnung — consultants bill milestones).
2. **Follow-up automation** (§5.3) with a "quotations awaiting response" dashboard widget.
3. **Kleinunternehmer cockpit**: track revenue vs. the €25k/€100k thresholds, warn *before* the immediate VAT-switch trap. Cheap to build, incumbents do it badly, very demo-able.
4. **Customer portal link**: client views quotation online, accepts/comments (the accept event feeds the checkpoint history). Digital quote tracking shortens sales cycles 8–14%.
5. **Text-block & service-catalog library** (Textbausteine): reusable positions with default prices — the #1 requested feature in every German invoicing tool review.
6. **Dunning (Mahnwesen)**: 3-level reminders with statutory late fees. v2, but a known must-have.
7. **Time tracking → billable line items** (consultants!). Simple timer + import into invoice. Papierkram's main draw.
8. **Recurring invoices** (retainers — very consultant-relevant).
9. **Bank feed reconciliation** (via finAPI/GoCardless-style provider) — v3; needed to claim "ERP-lite" seriously but heavy (PSD2 licensing via provider).
10. **Reporting**: revenue by client/project, open items (OPOS), simple EÜR preview. Recharts is already a dependency and unused.

---

## 9. Phased roadmap

### Phase 0 — De-domainization (foundation, ~2–3 weeks)
Goal: the current app, but domain-neutral, EUR, metric, German-ready. **No new features.**
- Tenant-level settings: currency, locale, unit system, pipeline phases, group-column label.
- Metric units + parser; EUR/`de-DE` defaults; remove all `₹`/`en-IN`.
- Rename `room` → configurable group across merge/diff/export/grids.
- Prompts → template files (per doc-type, language-parametric); model id from settings.
- Column defs single-sourced from backend.
- i18n scaffolding (`next-intl`), extract strings, ship DE + EN.

### Phase 1 — MVP for the PwC demo (~3–4 weeks)
Goal: end-to-end German happy path — *impressive but honest*.
- **Projects layer**: client → projects → quotation versions (replaces 1-quotation-per-client).
- **VAT engine v1**: net/gross, 19%/7%/0%, §19 note, per-line tax code; totals with tax breakdown (Netto / MwSt / Brutto).
- **Invoice module v1**: quotation → invoice conversion, gapless sequential numbering per tenant+year, §14 UStG field validation, immutable once issued (corrections via Stornorechnung/credit note only).
- **PDF generation** (WeasyPrint or Typst): German quotation + invoice templates, DIN 5008-ish letter layout.
- **AI intake v2**: PDF + pasted email → draft quotation via the existing verify-then-add flow.
- **Document language switch** DE/EN on quotation/invoice.
- Seed a German demo dataset (consulting firm + trades firm personas).

### Phase 2 — Compliance core (~4–6 weeks)
- **ZUGFeRD 2.x + XRechnung emission** (e.g. via `drafthorse`/`factur-x` libs) + validation against EN 16931 rules (KOSIT validator).
- **Inbound e-invoice parsing** (receive-duty!) — doubles as AI-intake showcase.
- GoBD hardening: append-only issued documents, full change journal, 8-year retention flags, export of the Verfahrensdokumentation skeleton.
- **DATEV export v1** (Buchungsstapel CSV; certified interface later).
- Email sending (provider: Resend/Postmark/SES) with document attachments + XRechnung XML.
- Kleinunternehmer threshold cockpit.

### Phase 3 — Multi-tenancy & product hardening (~4 weeks)
- `organization_id` across all tables + row-scoping dependency (replaces ad-hoc designer filtering); user CRUD; roles: owner / member / accountant (read-only + exports).
- Auth upgrade (refresh tokens, password reset; consider managed auth).
- Onboarding wizard (company data, Steuernummer/USt-IdNr, §19 status, logo, numbering scheme).
- Test coverage: tax engine, numbering, §14 validation, e-invoice generation are **non-negotiable test targets** (currently 4 backend test files, no API tests).

### Phase 4 — AI differentiators & growth (ongoing)
- Price suggestion from history (embeddings over line descriptions).
- Follow-up automation + customer portal accept flow.
- More languages (PL, TR, RU/UK) for documents, then UI.
- Text-block library, time tracking, recurring invoices, dunning.
- GAEB/LV import (opens the trades/tender segment).
- Reporting dashboard + lightweight cash-flow forecast.

**Sequencing rationale:** Phases 0–1 produce the demoable German product in ~6–7 weeks of focused work. Compliance depth (Phase 2) before multi-tenancy (Phase 3) because your first users can run on a single instance, but nobody in Germany will pay for an invoicing tool that isn't GoBD/E-Rechnung-credible.

---

## 10. Data model evolution (target additions)

```
organizations (tenant: name, legal_form, address, tax_number, vat_id,
               kleinunternehmer flag, default_currency/locale/language,
               numbering schemes, logo)
users            + organization_id, role owner|member|accountant
customers        (evolved clients: company/person, billing address,
                  vat_id, default_language, payment_terms)
projects         (customer_id, name, status, phase — replaces client.current_phase)
documents        (unified: type quotation|order_confirmation|invoice|credit_note,
                  project_id, number, status, issue/service/due dates,
                  language, currency, totals snapshot at issuance, immutable_at)
document_items   (evolved line items: group, description, qty, unit,
                  unit_price, tax_code, extra JSONB — keeps dynamic columns)
tax_codes        (DE19, DE7, DE0, §19, §13b reverse charge, IG-Lieferung…)
number_sequences (per org × doc-type × year, gapless)
catalog_items    (services/products with default price, unit, tax code, text blocks)
checkpoints      → attach to project (unchanged mechanics — the crown jewel survives)
payments         (v2: invoice_id, date, amount, method)
attachments      (GoBD archive: original inbound docs, generated PDFs/XML, hashes)
```

Keep: `app_settings` column engine, `audit_log`, `agent_audit_log`, snapshots-on-document.

---

## 11. The PwC demo (what to show, what to ask)

**Show (15-min script):**
1. Paste a messy German RFQ email → AI drafts a structured quotation → human review screen (verify-then-add) → priced Angebot with Netto/MwSt/Brutto.
2. Client "calls with changes" → upload voice note → checkpoint → **"What Changed"** diff view → merged update. *(This is your unique feature — no incumbent has negotiation history.)*
3. One click: quotation → invoice → PDF + ZUGFeRD XML (even a validating stub impresses) → audit trail view.
4. Switch document language DE→EN live.

**Ask him:**
- Which segment first: consultants vs. trades vs. agencies? (Changes catalog + template priorities.)
- Is DATEV CSV export enough for v1, or is certified Rechnungsdatenservice expected immediately?
- What would make a PwC-adjacent firm *trust* the AI intake (audit expectations, human-in-the-loop evidence)?
- Pricing sanity check for €15–35/mo positioning; per-user vs. flat.
- GoBD: is a self-attested Verfahrensdokumentation acceptable early, or do buyers ask for an IDW PS 880-style attestation?

**Don't show:** multi-tenancy, banking, dunning — say "roadmap" if asked. A working narrow flow beats a broad broken one.

---

## 12. Risks & open questions

| Risk | Mitigation |
|---|---|
| Compliance surface is large (E-Rechnung profiles, §14 edge cases) | Use mature libs (factur-x/drafthorse), KOSIT validator in CI, scope v1 to standard domestic B2B cases |
| Incumbents ship revenue-side AI too | They're structurally slow on it (their AI teams work on receipt OCR); speed + niche focus is the defense. Window ≈ 12–24 months |
| GoBD/legal liability of generated invoices | Position as tool, user confirms every document; Verfahrensdokumentation; disclaimer pattern used by all incumbents |
| Solo bandwidth vs. roadmap size | Phases are cut so each ends in a shippable state; Phase 1 alone is a sellable "AI Angebots-Tool" even without Phase 2 |
| LLM cost on document intake | Already metered per call in `agent_audit_log`; price tiers by document volume |
| Data protection (GDPR) for AI processing | EU-region model hosting (Azure OpenAI EU / Anthropic via EU processing), AVV/DPA, PII hashing already in place |
| Open: company/brand, legal entity, hosting region (must be EU), payment provider | Decide before public beta, not before the PwC demo |

---

## 13. Summary judgment

- **Feasibility:** high — the hard, novel parts (AI intake with human-in-the-loop, deterministic merge/diff/versioning, dynamic schemas) already exist and are the parts competitors lack.
- **Market timing:** exceptional — the 2027/2028 e-invoicing deadlines create a forced-adoption wave; incumbent price hikes create switching intent.
- **The differentiator to protect:** *revenue-side AI + negotiation history + compliance-native output*, multilingual as the wedge for the fast-growing migrant-founder segment.
- **Next concrete step:** Phase 0 branch (de-domainization), then Phase 1 toward the PwC demo in ~6–7 weeks.
