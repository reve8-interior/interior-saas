'use client';

import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { HotspotRegion } from '@/lib/schemas/design';

interface RenderableHotspot extends HotspotRegion {
  id: string;
  label: string;
}

interface HotspotImageProps<T extends RenderableHotspot> {
  src: string;
  alt: string;
  hotspots: T[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When true, dragging on the image draws a new region (a click drops a pin). */
  drawing?: boolean;
  onDraw?: (region: HotspotRegion) => void;
  /** Region being edited but not yet saved. */
  draft?: HotspotRegion | null;
  /** E.g. a signed image URL expired; the parent can fetch a fresh one. */
  onImageError?: () => void;
}

/** Below this fraction of the image a drag counts as a click, i.e. a pin. */
const PIN_THRESHOLD = 0.01;

/** A region too small to be a box is shown as a round pin. */
const isPinRegion = (r: HotspotRegion) =>
  r.w < PIN_THRESHOLD && r.h < PIN_THRESHOLD;

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const pct = (n: number) => `${n * 100}%`;

/**
 * An image with clickable regions on top. Coordinates are fractions of the
 * image size, so the overlay stays aligned at any display width.
 */
export function HotspotImage<T extends RenderableHotspot>({
  src,
  alt,
  hotspots,
  selectedId,
  onSelect,
  drawing = false,
  onDraw,
  draft = null,
  onImageError,
}: HotspotImageProps<T>) {
  const box = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<HotspotRegion | null>(null);
  const drewRecently = useRef(false);

  const point = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top) / r.height),
    };
  };

  const regionBetween = (
    a: { x: number; y: number },
    b: { x: number; y: number }
  ): HotspotRegion => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  const onDown = (e: PointerEvent) => {
    if (!drawing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setStart(point(e));
  };

  const onMove = (e: PointerEvent) => {
    if (start) setLive(regionBetween(start, point(e)));
  };

  const onUp = (e: PointerEvent) => {
    if (!start) return;
    // The browser fires a click right after this; it must not deselect.
    drewRecently.current = true;
    const region = regionBetween(start, point(e));
    setStart(null);
    setLive(null);
    const isPin = isPinRegion(region);
    onDraw?.(isPin ? { x: start.x, y: start.y, w: 0, h: 0 } : region);
  };

  const preview = live ?? draft;

  return (
    <div
      ref={box}
      className={`relative select-none overflow-hidden rounded-lg ${
        drawing ? 'cursor-crosshair touch-none' : ''
      }`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onClick={() => {
        if (drewRecently.current) {
          drewRecently.current = false;
          return;
        }
        if (!drawing) onSelect(null);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onError={onImageError}
        className="block h-auto w-full"
      />

      {hotspots.map((h, i) => {
        const isPin = h.w === 0 && h.h === 0;
        const active = h.id === selectedId;
        return (
          <button
            key={h.id}
            type="button"
            aria-label={h.label}
            title={h.label}
            onClick={(e) => {
              e.stopPropagation();
              if (!drawing) onSelect(h.id);
            }}
            style={
              isPin
                ? { left: pct(h.x), top: pct(h.y) }
                : {
                    left: pct(h.x),
                    top: pct(h.y),
                    width: pct(h.w),
                    height: pct(h.h),
                  }
            }
            className={
              isPin
                ? `absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg transition-transform hover:scale-110 ${
                    active ? 'scale-125 bg-amber-500' : 'bg-primary-600'
                  } ${drawing ? 'pointer-events-none' : ''}`
                : `absolute rounded border-2 transition-colors ${
                    active
                      ? 'border-amber-400 bg-amber-400/25'
                      : 'border-white/90 bg-white/10 hover:bg-white/25'
                  } shadow-[0_0_0_1px_rgba(0,0,0,0.35)] ${
                    drawing ? 'pointer-events-none' : ''
                  }`
            }
          >
            {isPin ? i + 1 : null}
          </button>
        );
      })}

      {preview && (
        <div
          aria-hidden
          style={
            isPinRegion(preview)
              ? { left: pct(preview.x), top: pct(preview.y) }
              : {
                  left: pct(preview.x),
                  top: pct(preview.y),
                  width: pct(preview.w),
                  height: pct(preview.h),
                }
          }
          className={
            isPinRegion(preview)
              ? 'pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-amber-300 bg-amber-400/40'
              : 'pointer-events-none absolute rounded border-2 border-dashed border-amber-300 bg-amber-400/25'
          }
        />
      )}
    </div>
  );
}
