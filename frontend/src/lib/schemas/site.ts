export type SiteTheme =
  | 'classic'
  | 'warm-linen'
  | 'sage-stone'
  | 'midnight-gold'
  | 'mono-editorial'
  | 'blush-modern';

export interface SiteService {
  title: string;
  description: string;
}

export interface SiteSocial {
  label: string;
  url: string;
}

export interface SiteSettings {
  slug: string | null;
  published: boolean;
  mode: 'site' | 'gallery';
  tagline: string | null;
  about: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  services: SiteService[];
  socials: SiteSocial[];
  hide_badge: boolean;
  can_hide_badge: boolean;
  theme: SiteTheme;
  logo_url: string | null;
  hero_url: string | null;
}

/** Partial update: omitted fields are left alone, null/"" clears text. */
export interface SiteSettingsInput {
  tagline?: string | null;
  about?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  services?: SiteService[];
  socials?: SiteSocial[];
  hide_badge?: boolean;
  theme?: SiteTheme;
}

export interface SlugCheck {
  slug: string;
  available: boolean;
  reason: string | null;
}

export interface SiteAssetUrl {
  url: string;
}

export type BrandingKind = 'logo' | 'hero';

export interface PublicDesign {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  thumb_url: string | null;
}

export interface PublicProjectDesign extends PublicDesign {
  rooms: string[];
}

export interface PublicProject {
  id: string;
  title: string;
  location: string | null;
  year: number | null;
  category: string | null;
  story: string | null;
  cover_url: string | null;
  designs: PublicProjectDesign[];
}

export interface SiteContact {
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface SiteRedirectView {
  mode: 'redirect';
  slug: string;
}

export interface GalleryView {
  mode: 'gallery';
  business_name: string;
  designs: PublicDesign[];
}

export interface FullSiteView {
  mode: 'site';
  business_name: string;
  slug: string | null;
  logo_url: string | null;
  hero_url: string | null;
  tagline: string | null;
  about: string | null;
  services: SiteService[];
  socials: SiteSocial[];
  contact: SiteContact;
  show_badge: boolean;
  theme: SiteTheme;
  projects: PublicProject[];
}

/** Admin preview: never a redirect. */
export type SiteView = GalleryView | FullSiteView;

/** Public response by slug: an old slug answers with a redirect. */
export type PublicSiteView = SiteRedirectView | SiteView;

export interface ProjectDesign {
  id: string;
  title: string | null;
  client_id: string | null;
  position: number | null;
  view_url: string | null;
  thumb_url: string | null;
}

export interface Project {
  id: string;
  title: string;
  location: string | null;
  year: number | null;
  category: string | null;
  story: string | null;
  cover_design_id: string | null;
  position: number;
  designs: ProjectDesign[];
}

export interface ProjectInput {
  title: string;
  location?: string | null;
  year?: number | null;
  category?: string | null;
  story?: string | null;
}

export interface ProjectUpdateInput extends Partial<ProjectInput> {
  cover_design_id?: string | null;
}

/** One row of the design picker: any design of the business with an image. */
export interface DesignLibraryItem {
  id: string;
  title: string | null;
  thumb_url: string | null;
  client_name: string | null;
  project_id: string | null;
}
