import { api } from '@/lib/api';
import type {
  QuotationShare,
  ShareResponseKind,
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

export interface VersionRestoreResult {
  restored_number: number;
  items_restored: number;
  backup: QuotationVersionSummary | null;
}

/** Replace the live quotation with this version; the old state is saved as a new version. */
export function restoreVersion(
  versionId: string
): Promise<VersionRestoreResult> {
  return api.post<VersionRestoreResult>(
    `/quotation-versions/${versionId}/restore`,
    {}
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

/** Days a renewed link works when the old one had already run out. */
const RENEWED_LINK_DAYS = 30;

/**
 * Point the customer's existing link at another version. The server moves the
 * link, so its URL stays the same; prices and end date carry over (an end date
 * already past becomes a fresh 30 days).
 */
export async function moveShareLink(
  fromVersionId: string,
  toVersionId: string
): Promise<QuotationShare | null> {
  const [share] = await listVersionShares(fromVersionId);
  if (!share) return null;
  const stillOpen = share.expires_at && new Date(share.expires_at) > new Date();
  return createVersionShare(toVersionId, {
    show_prices: share.show_prices,
    expires_at: !share.expires_at
      ? null
      : stillOpen
        ? share.expires_at
        : new Date(Date.now() + RENEWED_LINK_DAYS * 86_400_000).toISOString(),
  });
}

/** Move a link's end date (null = no end) without changing its URL. */
export function updateVersionShareExpiry(
  versionId: string,
  shareId: string,
  expiresAt: string | null
): Promise<QuotationShare> {
  return api.patch<QuotationShare>(
    `/quotation-versions/${versionId}/shares/${shareId}`,
    { expires_at: expiresAt }
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

/** Public endpoint: the customer approves or asks a question. */
export function respondToSharedQuotation(
  token: string,
  body: { kind: ShareResponseKind; name: string; message: string | null }
): Promise<void> {
  return api.post<void>(
    `/quotation-share/${encodeURIComponent(token)}/respond`,
    body,
    { authToken: null }
  );
}
