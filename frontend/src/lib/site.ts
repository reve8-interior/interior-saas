import { api } from '@/lib/api';
import type {
  BrandingKind,
  DesignLibraryItem,
  Project,
  ProjectDesign,
  ProjectInput,
  ProjectUpdateInput,
  PublicSiteView,
  SiteAssetUrl,
  SiteSettings,
  SiteSettingsInput,
  SiteView,
  SlugCheck,
} from '@/lib/schemas/site';

/**
 * Mirrors the backend normalize_slug cleanup. Length is not enforced here:
 * the server validates it and reports the reason.
 */
export function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getSiteSettings(): Promise<SiteSettings> {
  return api.get<SiteSettings>('/site');
}

export function updateSiteSettings(
  body: SiteSettingsInput
): Promise<SiteSettings> {
  return api.put<SiteSettings>('/site', body);
}

export function checkSlug(slug: string): Promise<SlugCheck> {
  return api.get<SlugCheck>('/site/slug-check', { params: { slug } });
}

export function setSlug(slug: string): Promise<SiteSettings> {
  return api.put<SiteSettings>('/site/slug', { slug });
}

export function clearSlug(): Promise<SiteSettings> {
  return api.delete<SiteSettings>('/site/slug');
}

export function publishSite(): Promise<SiteSettings> {
  return api.post<SiteSettings>('/site/publish', {});
}

export function unpublishSite(): Promise<SiteSettings> {
  return api.post<SiteSettings>('/site/unpublish', {});
}

export function uploadBranding(
  kind: BrandingKind,
  file: File
): Promise<SiteAssetUrl> {
  const form = new FormData();
  form.append('file', file);
  return api.postForm<SiteAssetUrl>(`/site/${kind}`, form);
}

/** What the public page would show, published or not. */
export function getSitePreview(): Promise<SiteView> {
  return api.get<SiteView>('/site/preview');
}

/** Public, no auth. Rejects with ApiError (status 404 when unavailable). */
export function getPublicSite(slug: string): Promise<PublicSiteView> {
  return api.getPublic<PublicSiteView>(
    `/site/${encodeURIComponent(slug)}`,
    'Site not available'
  );
}

export function listProjects(): Promise<Project[]> {
  return api.get<Project[]>('/projects');
}

/** All of the business's designs with an image, newest first (max 500). */
export function listDesignLibrary(): Promise<DesignLibraryItem[]> {
  return api.get<DesignLibraryItem[]>('/projects/library');
}

export function createProject(body: ProjectInput): Promise<Project> {
  return api.post<Project>('/projects', body);
}

export function updateProject(
  projectId: string,
  body: ProjectUpdateInput
): Promise<Project> {
  return api.patch<Project>(`/projects/${projectId}`, body);
}

export function deleteProject(projectId: string): Promise<void> {
  return api.delete<void>(`/projects/${projectId}`);
}

export function reorderProjects(ids: string[]): Promise<void> {
  return api.put<void>('/projects/order', { ids });
}

/** A design moves out of any other project it was in. */
export function attachDesigns(
  projectId: string,
  designIds: string[]
): Promise<Project> {
  return api.post<Project>(`/projects/${projectId}/designs`, {
    design_ids: designIds,
  });
}

export function detachDesign(
  projectId: string,
  designId: string
): Promise<void> {
  return api.delete<void>(`/projects/${projectId}/designs/${designId}`);
}

export function reorderProjectDesigns(
  projectId: string,
  designIds: string[]
): Promise<void> {
  return api.put<void>(`/projects/${projectId}/designs/order`, {
    design_ids: designIds,
  });
}

export function uploadProjectImage(
  projectId: string,
  file: File,
  title: string
): Promise<ProjectDesign> {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  return api.postForm<ProjectDesign>(`/projects/${projectId}/upload`, form);
}
