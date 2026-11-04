'use client';

import { Check } from 'lucide-react';
import { hotspotIcon } from '@/lib/hotspotIcons';

interface HotspotListItem {
  id: string;
  label: string;
  icon?: string | null;
}

interface HotspotListProps {
  hotspots: HotspotListItem[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Hotspots already in the quotation get a check. */
  linkedIds?: ReadonlySet<string>;
}

/**
 * Numbered list that mirrors the pins on the image. Hovering a row lights up
 * its pin, and hovering a pin lights up its row.
 */
export function HotspotList({
  hotspots,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  linkedIds,
}: HotspotListProps) {
  if (hotspots.length === 0) return null;
  return (
    <ol aria-label="Marked items" className="space-y-1">
      {hotspots.map((h, i) => {
        const active = h.id === selectedId;
        const hot = h.id === hoveredId;
        const ItemIcon = hotspotIcon(h.label, h.icon);
        return (
          <li key={h.id}>
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(h.id)}
              onMouseEnter={() => onHover(h.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(h.id)}
              onBlur={() => onHover(null)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left text-sm transition-colors ${
                active
                  ? 'bg-amber-500/15 font-semibold text-text'
                  : hot
                    ? 'bg-text/5 text-text'
                    : 'text-muted hover:bg-text/5'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${
                  active ? 'bg-amber-500' : 'bg-dark-700'
                }`}
              >
                {ItemIcon ? (
                  <ItemIcon className="h-4 w-4" weight="light" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{h.label}</span>
              {linkedIds &&
                (linkedIds.has(h.id) ? (
                  <Check
                    className="h-4 w-4 shrink-0 text-green-600"
                    aria-label="In quotation"
                  />
                ) : (
                  <span className="shrink-0 text-xs text-muted">
                    Not in quotation
                  </span>
                ))}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
