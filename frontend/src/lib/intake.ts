import { api } from '@/lib/api';

export type RoomMatch = 'existing' | 'suggested' | 'new';

export interface IntakeRow {
  room: string;
  description: string;
}

export interface SimilarItem {
  id: string;
  room: string;
  description: string;
  summary: string;
}

export interface MaterialSuggestion {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
}

export interface IntakeResult {
  /** The room to use: the quotation's own when the name matched one. */
  room: string;
  room_status: RoomMatch;
  similar: SimilarItem | null;
  /** Catalogue material the description names, with its unit and rate. */
  material?: MaterialSuggestion | null;
}

/** Which quotation room each row belongs to, and any similar existing item. */
export async function checkIntake(
  clientId: string,
  rows: IntakeRow[]
): Promise<IntakeResult[]> {
  const res = await api.post<{ rows: IntakeResult[] }>(
    `/clients/${clientId}/quotation/intake-check`,
    { rows }
  );
  return res.rows;
}

/**
 * The quotation room to start a new row in. A typed room is snapped to the
 * quotation's own spelling when it differs only by case; with nothing typed,
 * a quotation that has a single room supplies it. Otherwise left as is.
 */
export function preselectRoom(current: string, rooms: string[]): string {
  const typed = current.trim();
  if (!typed) return rooms.length === 1 ? rooms[0] : '';
  const same = rooms.find((r) => r.toLowerCase() === typed.toLowerCase());
  return same ?? current;
}
