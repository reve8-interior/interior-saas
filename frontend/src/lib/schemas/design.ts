/** Region of an image as fractions (0-1) of its width and height. w = h = 0 is a pin. */
export interface HotspotRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HotspotMaterial {
  id: string;
  name: string;
  category: string;
  unit: string;
  /** Decimals arrive as strings from the API. */
  unit_cost: string | number;
}

export interface Hotspot extends HotspotRegion {
  id: string;
  design_id: string;
  material_id: string | null;
  /** Set once the hotspot has been added to the quotation. */
  quotation_line_item_id: string | null;
  label: string;
  notes: string | null;
  dimensions: string | null;
  /** Decimals arrive as strings from the API. */
  labour_cost: string | number | null;
  material: HotspotMaterial | null;
}

export interface HotspotQuotationInput {
  room: string;
  description: string | null;
  unit: string;
  raw_dimension: string | null;
  qty: number | null;
  rate: number | null;
  remarks: string | null;
}

export interface HotspotInput extends HotspotRegion {
  label: string;
  notes: string | null;
  material_id: string | null;
  dimensions: string | null;
  labour_cost: number | null;
}

export interface Design {
  id: string;
  client_id: string;
  title: string | null;
  source: string;
  image_url: string | null;
  is_selected: boolean;
  /** Opted in to the business's public portfolio page. */
  in_portfolio: boolean;
  /** Quotation rooms this image belongs to (pre-selects it in versions). */
  rooms: string[];
  description: string | null;
  created_at: string;
  hotspots: Hotspot[];
}

export interface ShareLink {
  id: string;
  client_id: string;
  url: string;
  design_ids: string[] | null;
  show_prices: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ShareLinkInput {
  design_ids: string[] | null;
  show_prices: boolean;
  expires_at: string | null;
}

/** What a customer may see about an item; vendor is never exposed. */
export interface SharedItem {
  name: string;
  category: string;
  unit: string;
  unit_cost: string | number | null;
}

export interface SharedHotspot extends HotspotRegion {
  id: string;
  label: string;
  notes: string | null;
  dimensions: string | null;
  /** Omitted when prices are hidden. */
  labour_cost: string | number | null;
  item: SharedItem | null;
}

export interface SharedDesign {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  hotspots: SharedHotspot[];
}

/** A design with its owner, for the designer's portfolio manager. */
export interface PortfolioDesign extends Design {
  client_name: string;
}

export interface PortfolioShare {
  id: string;
  url: string;
  design_ids: string[];
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface PortfolioShareInput {
  design_ids: string[];
  expires_at: string | null;
}

/** Public showcase: no client names, no rates. */
export interface PortfolioView {
  business_name: string | null;
  designs: SharedDesign[];
}

export interface SharedView {
  business_name: string | null;
  project_name: string;
  show_prices: boolean;
  designs: SharedDesign[];
}
