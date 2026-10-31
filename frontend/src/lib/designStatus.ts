import type { Design } from './schemas/design';

export interface DesignProgress {
  hotspots: number;
  /** Hotspots already turned into a quotation line. */
  linked: number;
}

/** How far a design has got from marked-up image to quotation lines. */
export function designProgress(
  design: Pick<Design, 'hotspots'>
): DesignProgress {
  return {
    hotspots: design.hotspots.length,
    linked: design.hotspots.filter((h) => h.quotation_line_item_id).length,
  };
}

/**
 * What a design's linked quotation lines add up to. `priceByLineId` maps a
 * quotation line to its price (negotiated, else initial); unpriced lines are 0.
 */
export function linkedTotal(
  design: Pick<Design, 'hotspots'>,
  priceByLineId: ReadonlyMap<string, number>
): number {
  let total = 0;
  for (const h of design.hotspots) {
    if (h.quotation_line_item_id)
      total += priceByLineId.get(h.quotation_line_item_id) ?? 0;
  }
  return total;
}

/**
 * The material's current rate when it no longer matches the rate on the
 * quotation line made from it; null when they agree or either is unknown.
 */
export function rateDrift(
  materialRate: number | string | null | undefined,
  lineRate: number | null | undefined
): number | null {
  if (materialRate == null || lineRate == null) return null;
  const current = Number(materialRate);
  return Number.isFinite(current) && current !== lineRate ? current : null;
}
