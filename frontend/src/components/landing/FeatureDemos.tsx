'use client';

import { HotspotImage } from '@/components/designs/HotspotImage';
import { Check, Globe, Sparkles } from 'lucide-react';
import { useLoop } from './useLoop';

/** Looping product demos for the landing page, drawn in code. All names and amounts are sample data. */

const FRAME = 'surface overflow-hidden p-4 text-xs';
const MUTED = 'text-dark-500 dark:text-dark-400';
const FADE = 'transition-all duration-500';

const shown = (on: boolean): string =>
  on ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0';

const noop = (): void => undefined;

interface DemoRoom {
  id: string;
  label: string;
  name: string;
  size: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const room = (
  id: string,
  name: string,
  size: string,
  [x, y, w, h]: [number, number, number, number]
): DemoRoom => ({ id, name, size, label: `${name} · ${size}`, x, y, w, h });

/** Regions are fractions of floor-plan.png, drawn over the rooms in that drawing. */
const ROOMS: DemoRoom[] = [
  room('b2', 'Bedroom 2', '9 × 12 ft', [0.096, 0.135, 0.196, 0.33]),
  room('b3', 'Bedroom 3', '9 × 12 ft', [0.348, 0.135, 0.19, 0.33]),
  room('mb', 'Master bedroom', '12.7 × 12 ft', [0.66, 0.135, 0.26, 0.33]),
  room('fr', 'Family room', '15 × 16.3 ft', [0.096, 0.48, 0.245, 0.44]),
  room('dn', 'Dining area', '9 × 16.3 ft', [0.34, 0.48, 0.27, 0.44]),
  room('kt', 'Kitchen', '8.5 × 16.3 ft', [0.615, 0.48, 0.165, 0.44]),
  room('cl', 'Closet', '6 × 7 ft', [0.79, 0.485, 0.125, 0.18]),
];

/**
 * A real floor plan: the app's own region overlay finds the rooms one by one, and each becomes a starter
 * row. Phase 0 is the bare plan, 1..N finds a room, N+1 holds the finished state.
 */
export function FloorPlanDemo() {
  const { ref, phase } = useLoop(ROOMS.length + 2, 1000);
  const found = Math.min(phase, ROOMS.length);
  const current = phase >= 1 && phase <= ROOMS.length ? ROOMS[phase - 1] : null;

  return (
    <div ref={ref} className={`${FRAME} space-y-4`}>
      <HotspotImage
        src="/landing/demo/floor-plan.png"
        alt="A three-bedroom floor plan"
        hotspots={ROOMS.slice(0, found)}
        selectedId={current?.id ?? null}
        onSelect={noop}
      />
      <div>
        <p className="eyebrow mb-2 flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Starter rows
        </p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {ROOMS.map((r, i) => (
            <li
              key={r.id}
              className={`flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 ${FADE} ${shown(i < found)}`}
            >
              <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
              <span className="text-dark-900 dark:text-white">{r.name}</span>
              <span className={`ml-auto whitespace-nowrap ${MUTED}`}>
                {r.size}
              </span>
            </li>
          ))}
        </ul>
        <p className={`mt-3 ${MUTED} ${FADE} ${shown(found >= ROOMS.length)}`}>
          You review and edit before anything is added.
        </p>
      </div>
    </div>
  );
}

interface DemoPin {
  id: string;
  label: string;
  x: number;
  y: number;
  w: 0;
  h: 0;
  category: string;
  detail: string;
  rate: string;
}

const PINS: DemoPin[] = [
  {
    id: 'wall',
    label: 'Gallery wall frames',
    x: 0.3,
    y: 0.33,
    w: 0,
    h: 0,
    category: 'Decor',
    detail: 'Set of 12 · black frames, white mount',
    rate: '₹18,500',
  },
  {
    id: 'sofa',
    label: 'L-shape sofa',
    x: 0.64,
    y: 0.62,
    w: 0,
    h: 0,
    category: 'Furniture',
    detail: '9 ft · beige fabric · chaise on right',
    rate: '₹86,000',
  },
  {
    id: 'table',
    label: 'Round coffee table',
    x: 0.55,
    y: 0.77,
    w: 0,
    h: 0,
    category: 'Furniture',
    detail: '3 ft dia · oak veneer, lower shelf',
    rate: '₹24,500',
  },
];

/**
 * The app's own pin image on a real photo: pins appear, then each one is opened in turn with the spotlight
 * and label card, and its details show underneath. Phase 0 is bare, 1..N drops a pin, then one phase per pin.
 */
export function PinsDemo() {
  const { ref, phase } = useLoop(PINS.length * 2 + 1, 1400);
  const dropped = Math.min(phase, PINS.length);
  const opened = phase > PINS.length ? PINS[phase - PINS.length - 1] : null;

  return (
    <div ref={ref} className={FRAME}>
      <HotspotImage
        src="/landing/demo/living-room.jpg"
        alt="A living room with pinned items"
        hotspots={PINS.slice(0, dropped)}
        selectedId={opened?.id ?? null}
        onSelect={noop}
      />
      <div className="mt-3 flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
        {opened ? (
          <>
            <div key={opened.id} className="min-w-0 animate-fade-in">
              <p className="truncate font-semibold text-dark-900 dark:text-white">
                {opened.label}
              </p>
              <p className={`truncate ${MUTED}`}>
                {opened.category} · {opened.detail}
              </p>
            </div>
            <span className="font-semibold text-dark-900 dark:text-white">
              {opened.rate}
            </span>
          </>
        ) : (
          <p className={MUTED}>Tap a pin to see the item, size and rate.</p>
        )}
      </div>
    </div>
  );
}

const PROJECT_TILES: { name: string; tone: string; delay: string }[] = [
  {
    name: '2BHK, Kondapur',
    tone: 'bg-amber-200/80 dark:bg-amber-900/30',
    delay: 'delay-100',
  },
  {
    name: 'Villa, Jubilee Hills',
    tone: 'bg-primary-200/80 dark:bg-primary-400/10',
    delay: 'delay-200',
  },
  {
    name: 'Studio apartment',
    tone: 'bg-green-200/70 dark:bg-green-900/30',
    delay: 'delay-300',
  },
];

/** A studio website assembling section by section, ending on a custom domain. */
export function WebsiteDemo() {
  const { ref, phase } = useLoop(5, 1700);

  return (
    <div ref={ref} className="surface overflow-hidden text-xs">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <Globe className={`h-3.5 w-3.5 shrink-0 ${MUTED}`} />
        <span className="truncate font-medium text-dark-900 dark:text-white">
          {phase >= 4 ? 'studioarya.in' : 'portal.reve8.com/studioarya'}
        </span>
        <span
          className={`ml-auto rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400 ${FADE} ${shown(phase >= 4)}`}
        >
          Your domain
        </span>
      </div>
      <div className="space-y-4 p-4">
        <div className="rounded-xl bg-gradient-to-br from-primary-200 to-amber-100 p-5 dark:from-primary-400/20 dark:to-amber-900/20">
          <p className="font-heading text-lg font-extrabold text-dark-900 dark:text-white">
            Studio Arya
          </p>
          <p className="text-dark-700 dark:text-dark-300">
            Homes shaped around the way you live.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PROJECT_TILES.map((tile) => (
            <div
              key={tile.name}
              className={`${FADE} ${tile.delay} ${shown(phase >= 1)}`}
            >
              <div className={`aspect-square rounded-lg ${tile.tone}`} />
              <p className="mt-1 truncate text-dark-900 dark:text-white">
                {tile.name}
              </p>
            </div>
          ))}
        </div>
        <div className={`flex flex-wrap gap-1.5 ${FADE} ${shown(phase >= 2)}`}>
          {['Full-home interiors', 'Modular kitchens', 'Consultation'].map(
            (service) => (
              <span
                key={service}
                className="rounded-full border border-line px-2.5 py-1"
              >
                {service}
              </span>
            )
          )}
        </div>
        <div
          className={`flex items-center justify-between rounded-xl border border-line px-3 py-2 ${FADE} ${shown(phase >= 3)}`}
        >
          <span className={MUTED}>hello@studioarya.in</span>
          <span className="rounded bg-brand px-2 py-1 font-semibold text-white">
            Get in touch
          </span>
        </div>
      </div>
    </div>
  );
}
