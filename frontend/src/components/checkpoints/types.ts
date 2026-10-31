'use client';

import { type ItemAction } from '@/lib/checkpoints';

export type { LineItemData } from '@/lib/checkpointItems';

export interface Checkpoint {
  id: string;
  summary_text: string;
  structured_diff: Record<string, unknown>;
  raw_conversation: string | null;
  audio_transcript: string | null;
  status: string;
  source: string;
  added_to_quotation: boolean;
  created_at: string;
  /** When and by whom the rows were added to the quotation. */
  applied_at?: string | null;
  applied_by_name?: string | null;
}

export interface CardItem {
  action: ItemAction;
  target_summary: string | null;
  verified?: boolean;
  agreed_price?: number | null;
  extra?: Record<string, string | number | null> | null;
}
