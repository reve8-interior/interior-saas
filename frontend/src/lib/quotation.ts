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
  itemId: string
): Promise<void> {
  return api.delete<void>(`/quotations/${quotationId}/items/${itemId}`);
}

/** Partially update a line item (price, remarks, status, …). */
export function updateLineItem(
  quotationId: string,
  itemId: string,
  payload: LineItemUpdate
): Promise<QuotationLineItem> {
  return api.patch<QuotationLineItem>(
    `/quotations/${quotationId}/items/${itemId}`,
    payload
  );
}

/** Fetch all materials for dropdown selection. */
export function getMaterials(): Promise<Material[]> {
  return api.get<Material[]>('/materials');
}
