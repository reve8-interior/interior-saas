import { api } from '@/lib/api';
import type {
  QuotationShare,
  QuotationShareInput,
  QuotationVersion,
  QuotationVersionSummary,
  SharedQuotationView,
} from '@/lib/schemas/quotationVersion';

export function listQuotationVersions(
  clientId: string
): Promise<QuotationVersionSummary[]> {
  return api.get<QuotationVersionSummary[]>(
    `/clients/${clientId}/quotation/versions`
  );
}

/** Freeze the current quotation as the next numbered version. */
export function saveQuotationVersion(
  clientId: string,
  label: string | null,
  roomDesigns: Record<string, string[]>
): Promise<QuotationVersionSummary> {
  return api.post<QuotationVersionSummary>(
    `/clients/${clientId}/quotation/versions`,
    { label, room_designs: roomDesigns }
  );
}

/** Save an edited Excel export as a new version. */
export function importQuotationVersion(
  clientId: string,
  file: File,
  label: string | null
): Promise<QuotationVersionSummary> {
  const form = new FormData();
  form.append('file', file);
  if (label) form.append('label', label);
  return api.postForm<QuotationVersionSummary>(
    `/clients/${clientId}/quotation/versions/import`,
    form
  );
}

/** Client pick: mark this version as agreed; moves the project to implementation. */
export function agreeVersion(
  versionId: string
): Promise<QuotationVersionSummary> {
  return api.put<QuotationVersionSummary>(
    `/quotation-versions/${versionId}/agree`,
    {}
  );
}

/** Undo the client pick (the project phase stays as it is). */
export function unagreeVersion(
  versionId: string
): Promise<QuotationVersionSummary> {
  return api.delete<QuotationVersionSummary>(
    `/quotation-versions/${versionId}/agree`
  );
}

/** Deactivate a version, or restore it. */
export function setVersionActive(
  versionId: string,
  isActive: boolean
): Promise<QuotationVersionSummary> {
  return api.patch<QuotationVersionSummary>(
    `/quotation-versions/${versionId}/active`,
    { is_active: isActive }
  );
}

/** Change which design images appear with which room of a saved version. */
export function setVersionDesigns(
  versionId: string,
  roomDesigns: Record<string, string[]>
): Promise<QuotationVersionSummary> {
  return api.put<QuotationVersionSummary>(
    `/quotation-versions/${versionId}/designs`,
    { room_designs: roomDesigns }
  );
}

export function getQuotationVersion(
  versionId: string
): Promise<QuotationVersion> {
  return api.get<QuotationVersion>(`/quotation-versions/${versionId}`);
}

export function listVersionShares(
  versionId: string
): Promise<QuotationShare[]> {
  return api.get<QuotationShare[]>(`/quotation-versions/${versionId}/shares`);
}

export function createVersionShare(
  versionId: string,
  body: QuotationShareInput
): Promise<QuotationShare> {
  return api.post<QuotationShare>(
    `/quotation-versions/${versionId}/shares`,
    body
  );
}

export function revokeVersionShare(
  versionId: string,
  shareId: string
): Promise<void> {
  return api.delete<void>(`/quotation-versions/${versionId}/shares/${shareId}`);
}

/** Public endpoint: deliberately sends no Authorization header. */
export async function getSharedQuotation(
  token: string
): Promise<SharedQuotationView> {
  return api.getPublic<SharedQuotationView>(
    `/quotation-share/${encodeURIComponent(token)}`,
    'Link not available'
  );
}
