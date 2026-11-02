import { api } from '@/lib/api';

export interface CatalogChatModel {
  model: string;
  /** Decimals arrive as strings. */
  input_per_million_usd: string;
  output_per_million_usd: string;
  est_cost_per_extraction_usd: string;
}

export interface CatalogTranscriptionModel {
  model: string;
  per_minute_usd: string;
}

/** Every priced model the platform admin can assign. */
export interface ModelCatalog {
  chat: CatalogChatModel[];
  transcription: CatalogTranscriptionModel[];
  default_chat_model: string;
}

export function getModelCatalog(): Promise<ModelCatalog> {
  return api.get<ModelCatalog>('/ai/model-catalog');
}

/** "$0.0028" for tiny amounts, "$0.12" otherwise; "—" when unpriced. */
export function formatUsd(value: string | null): string {
  if (value === null) return '—';
  const n = Number(value);
  if (n === 0) return '$0';
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}
