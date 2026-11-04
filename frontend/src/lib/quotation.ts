import { api } from '@/lib/api';
import type {
  LineItemCreate,
  LineItemUpdate,
  Quotation,
  QuotationLineItem,
} from '@/lib/schemas/quotation';

export interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
  vendor: string | null;
  updated_at: string;
}

/** Fetch the client's quotation (room-grouped line items + totals). */
export function getQuotation(clientId: string): Promise<Quotation> {
  return api.get<Quotation>(`/clients/${clientId}/quotation`);
}

/** Create an empty quotation for the client (409 if one exists). */
export function createQuotation(clientId: string): Promise<Quotation> {
  return api.post<Quotation>(`/clients/${clientId}/quotation`, {});
}

/** Let an approved quotation change again (the approved version stays frozen). */
export function reopenQuotation(clientId: string): Promise<Quotation> {
  return api.post<Quotation>(`/clients/${clientId}/quotation/reopen`, {});
}

/** Add a line item; the backend parses raw_dimension and derives price. */
export function createLineItem(
  quotationId: string,
  payload: LineItemCreate
): Promise<QuotationLineItem> {
  return api.post<QuotationLineItem>(
    `/quotations/${quotationId}/items`,
    payload
  );
}

/** Delete a line item permanently. */
export function deleteLineItem(
  quotationId: string,
  itemId: string,
  expectedUpdatedAt?: string
): Promise<void> {
  return api.delete<void>(`/quotations/${quotationId}/items/${itemId}`, {
    params: { expected_updated_at: expectedUpdatedAt },
  });
}

/** Partially update a line item (price, remarks, status, …). */
export function updateLineItem(
  quotationId: string,
  itemId: string,
  payload: LineItemUpdate,
  expectedUpdatedAt?: string
): Promise<QuotationLineItem> {
  // The server refuses (409) if someone else changed the row since this
  // copy was loaded.
  return api.patch<QuotationLineItem>(
    `/quotations/${quotationId}/items/${itemId}`,
    { ...payload, expected_updated_at: expectedUpdatedAt }
  );
}

/** Fetch all materials for dropdown selection. */
export function getMaterials(): Promise<Material[]> {
  return api.get<Material[]>('/materials');
}

export type ReviewSeverity = 'error' | 'warning' | 'info';

export interface ReviewFinding {
  code: string;
  severity: ReviewSeverity;
  message: string;
  room: string | null;
  item_id: string | null;
}

export interface QuotationReview {
  findings: ReviewFinding[];
  items_checked: number;
}

/** Pre-send checks: missing prices, duplicates, outliers, likely gaps. */
export function reviewQuotation(clientId: string): Promise<QuotationReview> {
  return api.get<QuotationReview>(`/clients/${clientId}/quotation/review`);
}
