import type { SharedDesign } from '@/lib/schemas/design';
import type { QuotationLineItem } from '@/lib/schemas/quotation';

export interface QuotationVersionSummary {
  id: string;
  quotation_id: string;
  number: number;
  label: string | null;
  item_count: number;
  /** Room name -> ids of designs shown with that room. */
  room_designs: Record<string, string[]>;
  initial_total: number;
  negotiated_total: number;
  checkpoint_id: string | null;
  /** Inactive versions cannot be shared and their links stop working. */
  is_active: boolean;
  /** The version designer and client settled on (the client pick). */
  is_agreed: boolean;
  agreed_at: string | null;
  created_at: string;
}

export interface QuotationVersion extends QuotationVersionSummary {
  line_items: QuotationLineItem[];
}

export interface QuotationShare {
  id: string;
  version_id: string;
  url: string;
  show_prices: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface QuotationShareInput {
  show_prices: boolean;
  expires_at: string | null;
}

export interface SharedQuotationItem {
  description: string;
  unit: string;
  raw_dimension: string | null;
  qty: number | null;
  est_time: string | null;
  rate: number | null;
  amount: number | null;
}

export interface SharedQuotationRoom {
  room: string;
  items: SharedQuotationItem[];
  total: number | null;
  designs: SharedDesign[];
}

export interface SharedQuotationView {
  business_name: string | null;
  project_name: string;
  version_number: number;
  label: string | null;
  created_at: string;
  show_prices: boolean;
  is_agreed: boolean;
  rooms: SharedQuotationRoom[];
  total: number | null;
}
