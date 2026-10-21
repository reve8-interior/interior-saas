export type LineItemStatus =
  | 'draft'
  | 'priced'
  | 'pending_clarity'
  | 'agreed'
  | 'removed';

export type QuotationCatalogType = 'core_works' | 'loose_furniture';

export type QuotationDerivedState =
  | 'draft'
  | 'in_negotiation'
  | 'clarification_needed'
  | 'ready_for_approval';

export interface QuotationLineItem {
  id: string;
  quotation_id: string;
  room: string;
  position: number;
  description: string;
  catalog_type: QuotationCatalogType;
  unit: string;
  raw_dimension: string | null;
  computed_sqft: number | null;
  qty: number | null;
  rate: number | null;
  initial_price: number | null;
  negotiated_price: number | null;
  est_time: string | null;
  remarks: string | null;
  extra: Record<string, string | number | null>;
  status: LineItemStatus;
  material_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuotationRoomGroup {
  room: string;
  items: QuotationLineItem[];
  initial_total: number;
  negotiated_total: number;
  pending_clarity_count: number;
}

export interface QuotationSnapshot {
  checkpoint_id: string;
  created_at: string;
  line_items: Record<string, unknown>[];
}

export interface Quotation {
  id: string;
  client_id: string;
  design_id: string | null;
  checkpoint_id: string | null;
  status: string;
  created_at: string;
  rooms: QuotationRoomGroup[];
  initial_total: number;
  negotiated_total: number;
  pending_clarity_count: number;
  derived_state: QuotationDerivedState;
  snapshots: QuotationSnapshot[];
}

export interface LineItemCreate {
  room: string;
  description: string;
  unit: string;
  catalog_type?: QuotationCatalogType;
  position?: number;
  raw_dimension?: string | null;
  qty?: number | null;
  rate?: number | null;
  initial_price?: number | null;
  negotiated_price?: number | null;
  est_time?: string | null;
  remarks?: string | null;
  extra?: Record<string, string | number | null>;
  material_id?: string | null;
}

export type LineItemUpdate = Partial<LineItemCreate> & {
  status?: LineItemStatus;
};
