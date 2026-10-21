import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

export type ModelTier = 'economy' | 'balanced' | 'premium';

export interface ModelOption {
  tier: ModelTier;
  label: string;
  blurb: string;
  model: string;
  is_default: boolean;
  /** Decimals arrive as strings; null when the model has no list price. */
  input_per_million_usd: string | null;
  output_per_million_usd: string | null;
  est_cost_per_extraction_usd: string | null;
}

export interface CatalogChatModel {
  model: string;
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
  tier_defaults: Record<ModelTier, string>;
}

export function getModelCatalog(): Promise<ModelCatalog> {
  return api.get<ModelCatalog>('/ai/model-catalog');
}

const STORAGE_KEY = 'ai-model-tier';
const TIERS: ModelTier[] = ['economy', 'balanced', 'premium'];

function listModelOptions(): Promise<ModelOption[]> {
  return api.get<ModelOption[]>('/ai/models');
}

function isTier(value: string | null): value is ModelTier {
  return TIERS.includes(value as ModelTier);
}

/** "$0.0028" for tiny amounts, "$0.12" otherwise; "—" when unpriced. */
export function formatUsd(value: string | null): string {
  if (value === null) return '—';
  const n = Number(value);
  if (n === 0) return '$0';
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

/**
 * The user's chosen tier, remembered per browser. Falls back to the
 * backend's default tier until the options load or when nothing is saved.
 */
export function useModelTier() {
  const { data: options = [], isLoading } = useQuery({
    queryKey: ['ai-models'],
    queryFn: listModelOptions,
    staleTime: 5 * 60 * 1000,
  });
  const [saved, setSaved] = useState<ModelTier | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isTier(stored)) setSaved(stored);
    } catch {
      // Storage can be blocked; the default tier still works.
    }
  }, []);

  const fallback = options.find((o) => o.is_default)?.tier ?? 'balanced';
  const tier: ModelTier = saved ?? fallback;

  function setTier(next: ModelTier) {
    setSaved(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies for this session.
    }
  }

  return { options, tier, setTier, isLoading };
}
