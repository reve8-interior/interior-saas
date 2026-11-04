# AI Evaluation, Guardrails & Tracing Plan

Status: phase 1 implemented (capture hooks, guards, quote review). Phases 2–4 deferred until there is real usage data.

## Principle

Few users today, so build AI use cases as MVPs now, and collect the data that makes evaluation possible later. Capture first, evaluate when there is something real to evaluate.

## Phase 1 — Hooks (done)

| Hook | Where | Why |
|---|---|---|
| Run ID | `agent_audit_log.id`, returned as `audit_log_id` by extract and sent back on save | Joins an AI proposal to what the designer finally kept |
| Prompt version | `agent_audit_log.prompt_version` | Attribute quality changes to a prompt change |
| Proposed output | `agent_audit_log.proposed_output` (normalised items the AI suggested) | Eval "prediction" |
| Final output | `agent_audit_log.final_output` (items the designer saved) | Eval "ground truth", collected free from normal use |
| Guard flags | `agent_audit_log.guard_flags` | Count and review risky runs |
| Draft-only | AI output saves as a draft checkpoint; the quotation changes only after explicit verify and add | Human stays in the loop |

Guards (`services/ai_guards.py`), flag-and-warn, never silently mutate:

- Input: prompt-injection phrases in transcript or notes.
- Output: negative or zero qty/rate, rate far from the business's own material rate, absurd magnitudes, item description with no support in the transcript.

## Phase 2 — Golden set (after ~2–4 weeks of usage)

- Export runs where `final_output` is set: `proposed_output` vs `final_output`, transcript from the checkpoint.
- Hand-pick 20–30 diverse cases, anonymise names and phone numbers, review expected items manually.
- Store as `backend/tests/genai/golden/*.json` (the `genai` tests already hit real LLMs and stay out of CI).

## Phase 3 — Eval harness

Script `backend/tests/genai/run_eval.py`, run on every prompt or model change:

- Item recall and precision (match on room + description similarity).
- Action accuracy (add / update / remove).
- Quantity and rate accuracy.
- Total-price error versus golden.
- Guard false-positive rate.
- Report to a markdown table, compare with the previous run. Fail threshold set after the first baseline.

Acceptance rate (proposed vs final) is tracked from production data with a simple SQL query over `agent_audit_log`.

## Phase 4 — Tracing and monitoring

- Langfuse (or OpenTelemetry via PydanticAI) with the `audit_log_id` as the trace ID.
- Dashboard: acceptance rate, edit distance, cost per accepted item, latency, guard flag rate.

## Rule for every new AI feature

No feature ships without 5–10 hand-made test cases and: a run ID, a prompt version, guard checks, and draft-only output.

## Out of scope for now

LLM-as-judge scoring, automated prompt optimisation, fine-tuning.
