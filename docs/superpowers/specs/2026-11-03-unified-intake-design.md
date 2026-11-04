# Unified intake and team-safe quotations — design

## Why
Rows reach a quotation from notes, voice, text, floor plans, design hotspots and by hand. Each path handles rooms, duplicates and custom columns differently (floor plans and notes match, design hotspots and manual adds do not), and several people may edit one quotation at once.

## Part 1 — team safety (built)
- Row edits and deletes carry the `updated_at` the editor saw; a mismatch returns 409 naming who changed it, and the UI reloads the rows.
- Adding a meeting, undoing one, and editing a row take a row lock on the quotation, so they run one after another.
- Undo / revert is refused (409) when rows were edited by hand after the meeting went in, unless `force=true`. A "hand edit" is a change more than 10 seconds after the meeting was applied. Row deletions after the meeting are not detected.
- Not built: per-row "edited by X" display, live presence, an undo button in the UI (none exists today), and a "discard my edit and reload" dialog (the toast plus automatic reload is the MVP).

## Part 2 — one intake step (next)
Every source becomes a thin adapter that produces `IncomingRow`s. All rows then pass through one `resolve_incoming(rows, quotation)` before the designer sees them:

1. Room: exact / near match to an existing room, or a suggestion for generic labels (reuse `floorplan_rooms.match_rooms`).
2. Likely existing item: same room, similar description → shown as "matches Sofa in Living Room: update or add new?" Never merged silently.
3. Unit normalisation (existing `normalize_unit`).
4. Material suggestion from the materials master.
5. Custom-column defaults, so mandatory custom columns do not block the save.
6. Guards (`ai_guards.check_extracted_items`).

Adapters: notes/voice/text (existing extractor), floor plan (existing), design hotspot (new: today it skips all of the above), manual add (optional, later), Excel/BOQ paste (later).

Output: one review screen with a per-row status (new / matches existing / conflict), reused by every source.

## Non-goals
Real-time co-editing, per-field merge of simultaneous edits, automatic merging of matches.

## Builder's calls (mine)
- Start Part 2 with the design-hotspot adapter, the weakest path.
- Matches stay suggestions: a wrong auto-merge on a priced quote is worse than a duplicate the designer dismisses.

## Part 3 — the gate (built)
`services/intake_gate.decide()` is the single, pure decision for every row that reaches a quotation (add / update / remove / skip), used by meeting adds (notes, voice, text, floor plan), design hotspots and hand-typed rows. Rules are listed in the module docstring.
- Room spelling snaps to the quotation's own on an unambiguous match; generic labels are never renamed.
- Removed lines are never matched, updated or revived; a remove or update aimed at one does nothing and is counted as skipped.
- Single-row sources (hotspot, manual) get a 409 on a similar line unless `allow_duplicate` is sent; meetings fold a repeat into the existing line.
- Rows of one meeting are never folded into each other.
- `tests/test_intake_gate_guard.py` fails if a new file builds `QuotationLineItem` rows without the gate.
- Renaming a line (room or wording) meets the same gate: a rename into a look-alike is a 409 unless `allow_duplicate`; unrelated edits are never blocked.
- An approved quotation is frozen for every write (manual add, edit, delete, meeting add, undo, revert, hotspot) with a 409. `POST /clients/{id}/quotation/reopen` (audited) lets it change again; the approved version stays frozen.
- Bringing a removed line back (status change) meets the same gate as an add. Restoring a saved version locks the quotation and is refused while approved. "Undo delete" sends `allow_duplicate`, since it puts back what was just there.
- There is no drag-and-drop move or bulk status change in the product; inline cell edits only change status, price, qty and rate through the same PATCH.
