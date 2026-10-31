'use client';

import { Check, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { hotspotIcon } from '@/lib/hotspotIcons';
import type { HotspotRegion } from '@/lib/schemas/design';

interface RenderableHotspot extends HotspotRegion {
  id: string;
  label: string;
  icon?: string | null;
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
  /** Designer view only: these hotspots are green because they are in the quotation. */
  linkedIds?: ReadonlySet<string>;
  /** Highlighted from outside, e.g. the row under the pointer in the hotspot list. */
  hoveredId?: string | null;
  onHover?: (id: string | null) => void;
  /** Designer view only: when set, hotspots can be dragged to a new position. */
  onMove?: (id: string, region: HotspotRegion) => void;
  /** Show zoom controls; the zoomed image scrolls inside its frame. */
  zoomable?: boolean;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

const NAV_KEYS = [
  'ArrowRight',
  'ArrowDown',
  'ArrowLeft',
  'ArrowUp',
  'Home',
  'End',
];

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
  linkedIds,
  hoveredId = null,
  onHover,
  onMove,
  zoomable = false,
}: HotspotImageProps<T>) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const box = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<HotspotRegion | null>(null);
  const drewRecently = useRef(false);
  // Pointer position while choosing where to draw, for the ghost pin.
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // Hotspot being dragged: where it was grabbed and where it is now.
  const grab = useRef<{
    id: string;
    off: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    region: HotspotRegion;
  } | null>(null);
  const draggedRecently = useRef(false);

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

  const onPointerMove = (e: PointerEvent) => {
    if (start) setLive(regionBetween(start, point(e)));
    else if (drawing) setCursor(point(e));
  };

  /** Arrow keys step between hotspots; Home and End jump to the ends. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!NAV_KEYS.includes(e.key)) return;
    const items = Array.from(
      box.current?.querySelectorAll<HTMLElement>('[data-hotspot]') ?? []
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : (at + (forward ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
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

  const zoomBtn =
    'flex h-9 w-9 items-center justify-center rounded-lg bg-dark-900/80 text-white shadow backdrop-blur-sm hover:bg-dark-900 disabled:opacity-40';

  return (
    <div className="relative">
      {zoomable && (
        <div className="absolute right-2 top-2 z-40 flex gap-1 print:hidden">
          <button
            type="button"
            aria-label="Zoom out"
            className={zoomBtn}
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
          >
            <ZoomOut className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Reset zoom"
            className={zoomBtn}
            disabled={zoom === MIN_ZOOM}
            onClick={() => setZoom(MIN_ZOOM)}
          >
            <Maximize className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            className={zoomBtn}
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
          >
            <ZoomIn className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      <div
        className={`overflow-auto rounded-lg ${
          zoom > MIN_ZOOM ? 'max-h-[80vh]' : ''
        }`}
      >
        <div
          ref={box}
          style={zoom > MIN_ZOOM ? { width: `${zoom * 100}%` } : undefined}
          className={`relative select-none overflow-hidden rounded-lg ${
            drawing ? 'cursor-crosshair touch-none' : ''
          }`}
          onPointerDown={onDown}
          onPointerMove={onPointerMove}
          onPointerUp={onUp}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={onKeyDown}
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

          {/* Spotlight: dim the photo so the selected hotspot stands out. */}
          {selectedId && !drawing && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-black/30 transition-opacity"
            />
          )}

          {hotspots.map((h, i) => {
            const isPin = h.w === 0 && h.h === 0;
            const active = h.id === selectedId;
            const linked = linkedIds?.has(h.id) ?? false;
            const hot = h.id === hoveredId;
            const pos = drag?.id === h.id ? drag.region : h;
            const text = linked ? `${h.label} (in quotation)` : h.label;
            const ItemIcon = hotspotIcon(h.label, h.icon);
            // Keep the label card inside the image near its edges.
            const below = pos.y < 0.2;
            const alignCls =
              pos.x < 0.2
                ? 'left-0'
                : pos.x > 0.8
                  ? 'right-0'
                  : 'left-1/2 -translate-x-1/2';
            return (
              <button
                key={h.id}
                type="button"
                aria-label={text}
                data-hotspot
                onMouseEnter={() => onHover?.(h.id)}
                onMouseLeave={() => onHover?.(null)}
                onPointerDown={(e) => {
                  if (!onMove || drawing) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const p = point(e);
                  grab.current = {
                    id: h.id,
                    off: { x: p.x - h.x, y: p.y - h.y },
                    moved: false,
                  };
                }}
                onPointerMove={(e) => {
                  const g = grab.current;
                  if (!g || g.id !== h.id) return;
                  const p = point(e);
                  const x = Math.min(1 - h.w, Math.max(0, p.x - g.off.x));
                  const y = Math.min(1 - h.h, Math.max(0, p.y - g.off.y));
                  // A small wobble is a click, not a drag.
                  if (!g.moved && Math.hypot(x - h.x, y - h.y) < PIN_THRESHOLD)
                    return;
                  g.moved = true;
                  setDrag({ id: h.id, region: { x, y, w: h.w, h: h.h } });
                }}
                onPointerUp={() => {
                  const g = grab.current;
                  grab.current = null;
                  if (!g?.moved || !drag) return;
                  // The click that follows a drag must not select or deselect.
                  draggedRecently.current = true;
                  setDrag(null);
                  onMove?.(h.id, drag.region);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (draggedRecently.current) {
                    draggedRecently.current = false;
                    return;
                  }
                  if (!drawing) onSelect(h.id);
                }}
                style={
                  isPin
                    ? { left: pct(pos.x), top: pct(pos.y) }
                    : {
                        left: pct(pos.x),
                        top: pct(pos.y),
                        width: pct(h.w),
                        height: pct(h.h),
                      }
                }
                className={`group absolute ${active || drag?.id === h.id ? 'z-20' : 'z-10'} ${
                  onMove && !drawing
                    ? 'cursor-grab touch-none active:cursor-grabbing'
                    : ''
                } ${
                  isPin
                    ? 'flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center'
                    : `rounded-md border-2 transition-all ${
                        active
                          ? 'border-amber-300 bg-amber-300/20 shadow-[0_0_0_4px_rgba(251,191,36,0.25),0_0_24px_rgba(251,191,36,0.45)]'
                          : linked
                            ? 'border-green-400 bg-green-500/15 hover:bg-green-500/25'
                            : 'border-white/90 bg-white/10 hover:bg-white/25'
                      } ${hot && !active ? '!bg-white/25' : ''} shadow-[0_0_0_1px_rgba(0,0,0,0.35)]`
                } ${drawing ? 'pointer-events-none' : ''}`}
              >
                {isPin && (
                  <>
                    {!active && !drawing && (
                      <span
                        aria-hidden
                        className="pin-pulse absolute h-9 w-9 rounded-xl bg-white/60"
                      />
                    )}
                    <span
                      aria-hidden
                      className={`relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/60 text-sm font-bold text-white shadow-[0_4px_14px_rgba(0,0,0,0.4)] ring-1 ring-black/20 backdrop-blur-md transition-transform duration-200 ease-out group-hover:scale-110 ${
                        hot && !active ? 'scale-110' : ''
                      } ${
                        active
                          ? 'scale-110 bg-amber-500/80'
                          : linked
                            ? 'bg-green-600/70'
                            : 'bg-black/35'
                      }`}
                    >
                      {ItemIcon ? (
                        <>
                          <ItemIcon className="h-5 w-5" weight="light" />
                          <span className="absolute -bottom-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-dark-900/85 px-1 text-[10px] font-semibold leading-none text-white ring-1 ring-white/50">
                            {i + 1}
                          </span>
                        </>
                      ) : (
                        i + 1
                      )}
                      {linked && (
                        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-green-700 shadow">
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                  </>
                )}
                {/* Label card on hover / keyboard focus */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute z-30 max-w-[14rem] whitespace-nowrap rounded-lg bg-dark-900/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 ${alignCls} ${
                    below ? 'top-full mt-1' : 'bottom-full mb-1'
                  } ${active || hot ? 'opacity-100' : ''}`}
                >
                  <span className="block truncate">{text}</span>
                </span>
              </button>
            );
          })}

          {drawing && cursor && !start && (
            <div
              aria-hidden
              style={{ left: pct(cursor.x), top: pct(cursor.y) }}
              className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-dashed border-white/80 bg-white/10 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            />
          )}

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
                  ? 'pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-400/40'
                  : 'pointer-events-none absolute rounded border-2 border-dashed border-amber-300 bg-amber-400/25'
              }
            >
              {live && !isPinRegion(live) && (
                <span className="absolute -bottom-6 right-0 whitespace-nowrap rounded bg-dark-900/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                  {Math.round(live.w * 100)}% × {Math.round(live.h * 100)}%
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
