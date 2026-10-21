import { api } from '@/lib/api';
import type {
  Design,
  Hotspot,
  HotspotInput,
  HotspotQuotationInput,
  PortfolioDesign,
  PortfolioShare,
  PortfolioShareInput,
  PortfolioView,
  ShareLink,
  ShareLinkInput,
  SharedView,
} from '@/lib/schemas/design';

const designsPath = (clientId: string) => `/clients/${clientId}/designs`;

export function listDesigns(clientId: string): Promise<Design[]> {
  return api.get<Design[]>(designsPath(clientId));
}

export function uploadDesignImage(
  clientId: string,
  file: File,
  title: string,
  description: string
): Promise<Design> {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  if (description) form.append('description', description);
  return api.postForm<Design>(`${designsPath(clientId)}/upload`, form);
}

export function deleteDesign(
  clientId: string,
  designId: string
): Promise<void> {
  return api.delete<void>(`${designsPath(clientId)}/${designId}`);
}

export function selectDesign(
  clientId: string,
  designId: string
): Promise<Design> {
  return api.post<Design>(`${designsPath(clientId)}/${designId}/select`, {});
}

export function createHotspot(
  clientId: string,
  designId: string,
  body: HotspotInput
): Promise<Hotspot> {
  return api.post<Hotspot>(
    `${designsPath(clientId)}/${designId}/hotspots`,
    body
  );
}

export function updateHotspot(
  clientId: string,
  designId: string,
  hotspotId: string,
  body: HotspotInput
): Promise<Hotspot> {
  return api.put<Hotspot>(
    `${designsPath(clientId)}/${designId}/hotspots/${hotspotId}`,
    body
  );
}

export function deleteHotspot(
  clientId: string,
  designId: string,
  hotspotId: string
): Promise<void> {
  return api.delete<void>(
    `${designsPath(clientId)}/${designId}/hotspots/${hotspotId}`
  );
}

/** Create a quotation line from the hotspot (and the quotation if none yet). */
export function addHotspotToQuotation(
  clientId: string,
  designId: string,
  hotspotId: string,
  body: HotspotQuotationInput
): Promise<Hotspot> {
  return api.post<Hotspot>(
    `${designsPath(clientId)}/${designId}/hotspots/${hotspotId}/add-to-quotation`,
    body
  );
}

export function listShareLinks(clientId: string): Promise<ShareLink[]> {
  return api.get<ShareLink[]>(`/clients/${clientId}/share-links`);
}

export function createShareLink(
  clientId: string,
  body: ShareLinkInput
): Promise<ShareLink> {
  return api.post<ShareLink>(`/clients/${clientId}/share-links`, body);
}

export function revokeShareLink(
  clientId: string,
  linkId: string
): Promise<void> {
  return api.delete<void>(`/clients/${clientId}/share-links/${linkId}`);
}

export function setDesignInPortfolio(
  clientId: string,
  designId: string,
  inPortfolio: boolean
): Promise<Design> {
  return api.put<Design>(`${designsPath(clientId)}/${designId}/portfolio`, {
    in_portfolio: inPortfolio,
  });
}

export function setDesignRooms(
  clientId: string,
  designId: string,
  rooms: string[]
): Promise<Design> {
  return api.put<Design>(`${designsPath(clientId)}/${designId}/rooms`, {
    rooms,
  });
}

export function listPortfolioDesigns(): Promise<PortfolioDesign[]> {
  return api.get<PortfolioDesign[]>('/portfolio-designs');
}

export function listPortfolioShares(): Promise<PortfolioShare[]> {
  return api.get<PortfolioShare[]>('/portfolio-shares');
}

export function createPortfolioShare(
  body: PortfolioShareInput
): Promise<PortfolioShare> {
  return api.post<PortfolioShare>('/portfolio-shares', body);
}

export function revokePortfolioShare(id: string): Promise<void> {
  return api.delete<void>(`/portfolio-shares/${id}`);
}

export async function getPortfolioView(token: string): Promise<PortfolioView> {
  return api.getPublic<PortfolioView>(
    `/portfolio/${encodeURIComponent(token)}`,
    'Portfolio not available'
  );
}

/** Public endpoint: deliberately sends no Authorization header. */
export async function getSharedView(token: string): Promise<SharedView> {
  return api.getPublic<SharedView>(
    `/share/${encodeURIComponent(token)}`,
    'Link not available'
  );
}
