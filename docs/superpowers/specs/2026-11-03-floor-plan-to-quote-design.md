# Floor plan to draft quote — design

## Why
Designers retype room names and sizes from a plan before they can quote. A vision model reads the plan; the designer confirms the rooms; the portal drafts quote rows from the business's own past rates.

## Goals
- Upload a floor-plan image, get rooms with dimensions in seconds.
- Designer confirms or edits rooms **before** any quote row exists.
- Draft rows use the business's own rates; unknown rates stay blank (never invented).
- Reuse the existing draft-checkpoint flow: rows land unverified, the quotation changes only after the designer verifies and adds them.

## Non-goals
- PDF and CAD input, scale detection from drawings, furniture placement, render generation.
- LLM-chosen line items: the item list comes from a deterministic per-room template.

## Flow
1. `POST /clients/{id}/quotation/floor-plan/extract` (image) → rooms `{name, length_ft, width_ft, notes}` + guard warnings. Costs one AI credit; logged in `agent_audit_log` with prompt version and proposal.
2. Designer edits the rooms table.
3. `POST /clients/{id}/quotation/floor-plan/draft` (confirmed rooms) → draft rows (`ConfirmLineItem` shape): template items per room type, quantities from dimensions, rates from the business's median past rate for a similar description, else blank.
4. The frontend saves them through the existing `from-extraction` endpoint, so they appear as an unverified meeting to review.

## Guards
- Room sides outside 3–60 ft, or a room area over 2,500 sqft, are flagged.
- Vision output with no rooms returns a clear "could not read" message, not an empty success.
- Rooms are only ever confirmed by a human before drafting.

## Builder's calls (mine)
- Templates cover bedroom, kitchen, living, dining, bathroom, pooja; any other room gets none.
- Wardrobe = shorter side × 7 ft height (sqft); kitchen base cabinets = (length + width) × 2.5 ft; TV unit = 8 × 7 sqft; the designer adjusts.
