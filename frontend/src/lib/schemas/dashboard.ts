export interface DashboardStats {
  //Clients
  total_clients: number;
  active_clients: number;
  clients_by_phase: Record<string, number>;
  new_this_month: number;

  //Revenue
  total_revenue_approved: number;
  total_revenue_pending: number;
  revenue_by_phase: Record<string, number>;

  //AI Usage
  ai_total_calls: number;
  ai_calls_by_operation: Record<string, number>;

  //Margins
  global_margin_percent: number | null;
  margins_by_category: Record<string, number>;

  //Activity
  recent_checkpoints_30d: number;
  quotations_pending: number;
  avg_project_days: number;
}
