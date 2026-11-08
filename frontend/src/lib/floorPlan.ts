import { api } from '@/lib/api';
import type { ConfirmLineItem } from '@/lib/checkpoints';

export type RoomMatchStatus = 'existing' | 'suggested' | 'new';

export interface FloorPlanRoom {
  name: string;
  length_ft: number | null;
  width_ft: number | null;
  notes?: string | null;
  /** Whether `name` is a room the quotation already has. */
  match_status: RoomMatchStatus;
  /** What the plan called the room, when `name` was matched to another. */
  plan_label?: string | null;
}

export interface FloorPlanExtractResponse {
  /** Where the plan is stored; send it back when saving the draft. */
  source_image_path: string;
  audit_log_id: string;
  rooms: FloorPlanRoom[];
  existing_rooms: string[];
  warnings: string[];
  model: string;
}

/** A line in the quotation, or a row of an earlier draft, that a starter row repeats. */
export interface DraftMatch {
  /** Null for an earlier draft row, which can be skipped but not updated. */
  id: string | null;
  source: 'quotation' | 'draft';
  summary: string;
  /** Values the row could fill in because the line has none. */
  fills: Array<'raw_dimension' | 'qty' | 'rate'>;
}

/** What to do with a starter row that repeats an existing line. */
export type DraftChoice = 'add' | 'fill' | 'skip';

export interface DraftItem {
  room: string;
  description: string;
  unit: string;
  raw_dimension: string | null;
  qty: number | null;
  rate: number | null;
  action: string;
  match: DraftMatch | null;
}

export interface FloorPlanDraftResponse {
  line_items: DraftItem[];
  summary_text: string;
  warnings: string[];
}

/** Read rooms and dimensions off an uploaded floor-plan image. */
export function extractFloorPlan(
  clientId: string,
  file: File
): Promise<FloorPlanExtractResponse> {
  const fd = new FormData();
  fd.append('file', file);
  return api.postForm<FloorPlanExtractResponse>(
    `/clients/${clientId}/quotation/floor-plan/extract`,
    fd
  );
}

/** Template rows for the confirmed rooms (nothing is saved). */
export function draftFromFloorPlan(
  clientId: string,
  rooms: FloorPlanRoom[]
): Promise<FloorPlanDraftResponse> {
  return api.post<FloorPlanDraftResponse>(
    `/clients/${clientId}/quotation/floor-plan/draft`,
    { rooms }
  );
}

/** Fill in what is missing by default; otherwise leave the existing line alone. */
export function defaultChoice(item: DraftItem): DraftChoice {
  return item.match && item.match.fills.length > 0 ? 'fill' : 'skip';
}

/** One line naming the rows left out of the draft, or empty when none were. */
export function leftOutNote(items: DraftItem[]): string {
  const left = items.filter(
    (item) => defaultChoice(item) === 'skip' && item.match
  );
  if (left.length === 0) return '';
  const names = left.map((item) => `${item.room} — ${item.description}`);
  return `Already in the quotation or an earlier draft, left out: ${names.join('; ')}.`;
}

/**
 * Draft rows in the shape the draft-checkpoint save expects. A row that
 * repeats an existing line follows its choice: add anyway, update the line
 * with only the values it is missing, or leave it out.
 */
export function toConfirmItems(
  items: DraftItem[],
  choices: Record<number, DraftChoice> = {}
): ConfirmLineItem[] {
  const rows: ConfirmLineItem[] = [];
  items.forEach((item, index) => {
    const choice = item.match ? (choices[index] ?? defaultChoice(item)) : 'add';
    if (choice === 'skip') return;
    const fills =
      choice === 'fill' && item.match?.source === 'quotation'
        ? item.match.fills
        : null;
    const keep = (field: 'raw_dimension' | 'qty' | 'rate') =>
      !fills || fills.includes(field);
    rows.push({
      action: fills ? 'update' : 'add',
      target_item_id: fills ? (item.match?.id ?? null) : null,
      target_summary: fills ? (item.match?.summary ?? null) : null,
      room: item.room,
      description: item.description,
      unit: item.unit,
      raw_dimension: keep('raw_dimension') ? item.raw_dimension : null,
      qty: keep('qty') ? item.qty : null,
      rate: keep('rate') ? item.rate : null,
      est_time: null,
      remarks: null,
      catalog_type: 'core_works',
    });
  });
  return rows;
}
