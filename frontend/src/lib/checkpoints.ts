import { api } from '@/lib/api';
import type { ModelTier } from '@/lib/aiModels';

/** What the client did to the quotation in this meeting. */
export type ItemAction = 'add' | 'update' | 'remove';

export interface ExtractedLineItem {
  action: ItemAction;
  /** Live quotation line item this row edits; null for new work. */
  target_item_id: string | null;
  /** The targeted item as it stands today, for side-by-side review. */
  target_summary: string | null;
  room: string;
  description: string;
  /** Null when the agent had no basis for a unit — a human fills it in. */
  unit: string | null;
  raw_dimension: string | null;
  qty: number | null;
  rate: number | null;
  est_time: string | null;
  remarks: string | null;
  /** Total price the client agreed to for this item, if they did. */
  agreed_price?: number | null;
}

/** Something the notes leave open, put to the designer. */
export interface ExtractionQuestion {
  question: string;
  /** A sentence the designer can add to the notes to settle it. */
  suggested_note: string | null;
}

export interface MaterialHint {
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
}

/** Which slice of the quotation the agent was actually shown. */
export interface ExtractionScope {
  total_items: number;
  items_in_context: number;
  matched_rooms: string[];
}

export interface ExtractionResponse {
  audit_log_id: string;
  transcript: string;
  meeting_minutes: string[];
  line_items: ExtractedLineItem[];
  client_budget: number | null;
  material_hints: MaterialHint[];
  /** Scope-relevant statements that became no line item. */
  unmapped_notes: string[];
  /** Deterministic corrections applied after the model returned. */
  warnings: string[];
  questions: ExtractionQuestion[];
  scope: ExtractionScope;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  cost_usd: number | null;
}

export interface ConfirmLineItem extends ExtractedLineItem {
  catalog_type: string;
  /** Values for user-defined custom columns (see lib/lineItemColumns). */
  extra?: Record<string, string | number | null>;
}

/**
 * Proof that extraction ran on a checkpoint, stored in
 * `structured_diff.extraction`.
 *
 * Without it an empty line_items list is ambiguous — "nobody extracted
 * yet" and "extraction ran and this meeting changed no billable work"
 * look identical, and the UI offers to re-extract forever.
 */
export interface ExtractionRecord {
  ran_at: string;
  model: string;
  item_count: number;
  unmapped_notes: string[];
  questions?: ExtractionQuestion[];
}

// ── Checkpoint ordering ───────────────────────────────────────────────────────

export interface CheckpointOrderKey {
  id: string;
  created_at: string;
}

/**
 * Chronological comparison safe down to the microsecond: ISO timestamp
 * strings compare lexicographically at full precision (Date.getTime()
 * would truncate to milliseconds), with the id as a stable tiebreaker.
 * Mirrors the backend's (created_at, id) ordering.
 */
export function compareCheckpoints(
  a: CheckpointOrderKey,
  b: CheckpointOrderKey
): number {
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Map of checkpoint id → chronological number (#1 = oldest). */
export function checkpointNumbers(
  checkpoints: CheckpointOrderKey[]
): Record<string, number> {
  const numbers: Record<string, number> = {};
  [...checkpoints].sort(compareCheckpoints).forEach((cp, idx) => {
    numbers[cp.id] = idx + 1;
  });
  return numbers;
}

export type ConversationFilter = 'all' | 'pending' | 'added';

export const CONVERSATION_FILTER_LABELS: Record<ConversationFilter, string> = {
  all: 'All',
  pending: 'To add',
  added: 'In quotation',
};

interface PendingCheck {
  source: string;
  added_to_quotation: boolean;
  structured_diff?: Record<string, unknown> | null;
}

/**
 * True when a conversation still has rows waiting to go into the quotation.
 * Extraction that ran and found nothing has nothing to add; a legacy
 * ai_extract conversation without stored items counts as pending because its
 * items are unknown until re-extracted.
 */
export function blocksAddition(cp: PendingCheck): boolean {
  if (cp.added_to_quotation) return false;
  const diff = cp.structured_diff ?? {};
  if ('line_items' in diff) {
    return Array.isArray(diff.line_items) && diff.line_items.length > 0;
  }
  if ('extraction' in diff) return false;
  return cp.source === 'ai_extract';
}

export type ReviewableCheckpoint = CheckpointOrderKey & PendingCheck;

/** Meetings with rows still to add, oldest first: the order they must go in. */
export function reviewQueue<T extends ReviewableCheckpoint>(
  checkpoints: T[]
): T[] {
  return checkpoints.filter(blocksAddition).sort(compareCheckpoints);
}

/** Rows stored on a meeting; 0 for a legacy one not extracted yet. */
export function storedRowCount(cp: PendingCheck): number {
  const rows = cp.structured_diff?.line_items;
  return Array.isArray(rows) ? rows.length : 0;
}

/** Case-insensitive match on a conversation's summary and raw text; blank matches all. */
export function matchesConversationQuery(
  cp: { summary_text: string; raw_conversation?: string | null },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    cp.summary_text.toLowerCase().includes(q) ||
    (cp.raw_conversation ?? '').toLowerCase().includes(q)
  );
}

export function matchesConversationFilter(
  cp: PendingCheck,
  filter: ConversationFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'added') return cp.added_to_quotation;
  return blocksAddition(cp);
}

export interface FromExtractionRequest {
  summary_text: string;
  raw_transcript: string;
  audio_transcript?: string | null;
  line_items: ConfirmLineItem[];
  client_budget?: number | null;
  unmapped_notes?: string[];
  questions?: ExtractionQuestion[];
  /** The tier the extraction ran on, recorded on the checkpoint. */
  tier?: ModelTier;
  create_quotation: boolean;
}

export interface FromExtractionResponse {
  checkpoint_id: string;
  quotation_id: string | null;
  quotation_action: 'created' | 'updated' | 'none';
  items_added: number;
  items_updated: number;
}

export interface UpdateQuotationItemsResponse {
  quotation_id: string;
  action: 'created' | 'updated';
  items_count: number;
  items_added: number;
  items_updated: number;
  items_removed: number;
  /** Rows that edited an item deleted since the notes were read. */
  items_skipped: number;
}

export async function extractFromFile(
  clientId: string,
  file: File,
  tier?: ModelTier
): Promise<ExtractionResponse> {
  const fd = new FormData();
  fd.append('file', file);
  if (tier) fd.append('tier', tier);
  return api.postForm<ExtractionResponse>(
    `/clients/${clientId}/checkpoints/extract`,
    fd
  );
}

export async function extractFromText(
  clientId: string,
  text: string,
  tier?: ModelTier
): Promise<ExtractionResponse> {
  const fd = new FormData();
  fd.append('text', text);
  if (tier) fd.append('tier', tier);
  return api.postForm<ExtractionResponse>(
    `/clients/${clientId}/checkpoints/extract`,
    fd
  );
}

export async function saveFromExtraction(
  clientId: string,
  body: FromExtractionRequest
): Promise<FromExtractionResponse> {
  return api.post<FromExtractionResponse>(
    `/clients/${clientId}/checkpoints/from-extraction`,
    body
  );
}

export async function updateQuotationItems(
  clientId: string,
  checkpointId: string,
  lineItems: ConfirmLineItem[]
): Promise<UpdateQuotationItemsResponse> {
  return api.post<UpdateQuotationItemsResponse>(
    `/clients/${clientId}/quotation/update-items`,
    { checkpoint_id: checkpointId, line_items: lineItems }
  );
}

/** Replaces a draft meeting's notes; its rows are not touched. */
export async function updateCheckpointNotes(
  checkpointId: string,
  rawConversation: string
): Promise<void> {
  await api.patch(`/checkpoints/${checkpointId}/notes`, {
    raw_conversation: rawConversation,
  });
}

/** Throws away a meeting that is not on the quotation. */
export async function deleteCheckpoint(checkpointId: string): Promise<void> {
  await api.delete(`/checkpoints/${checkpointId}`);
}
