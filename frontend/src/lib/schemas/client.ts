export interface Designer {
  id: string;
  full_name: string | null;
  email: string;
}

export interface Client {
  id: string;
  name: string;
  current_phase: string;
  contact_info: Record<string, string>;
  assigned_designer_id: string | null;
  assigned_designer: Designer | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Designers who can see a client: its lead plus shared members. */
export interface ClientAccess {
  lead_id: string | null;
  member_ids: string[];
}

export interface MemberClients {
  lead_ids: string[];
  shared_ids: string[];
}
