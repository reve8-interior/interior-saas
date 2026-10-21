export interface PlatformTotals {
  businesses: number;
  active_businesses: number;
  users: number;
  clients: number;
  quotations: number;
  checkpoints: number;
  ai_calls: number;
  ai_tokens: number;
  ai_cost_usd: number;
}

export interface BusinessUsage {
  /** null = clients not assigned to any business's designer */
  id: string | null;
  name: string;
  is_active: boolean;
  users: number;
  clients: number;
  active_clients: number;
  quotations: number;
  checkpoints: number;
  ai_calls: number;
  ai_tokens: number;
  ai_cost_usd: number;
  last_activity: string | null;
}

export interface AdminOverview {
  totals: PlatformTotals;
  businesses: BusinessUsage[];
  ai_calls_by_operation: Record<string, number>;
}

export interface BusinessClientRow {
  id: string;
  name: string;
  phase: string;
  is_active: boolean;
  contact_info: Record<string, unknown>;
  designer_email: string | null;
  quotations: number;
  checkpoints: number;
  ai_calls: number;
  created_at: string;
}

export interface OperationUsage {
  operation: string;
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface DailyUsage {
  day: string;
  calls: number;
  tokens: number;
  cost_usd: number;
}

export interface RecentCall {
  timestamp: string;
  operation: string;
  model: string;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  client_name: string | null;
}

export interface BusinessAIUsage {
  days: number;
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
  avg_latency_ms: number;
  cost_usd: number;
  by_operation: OperationUsage[];
  daily: DailyUsage[];
  recent: RecentCall[];
}
