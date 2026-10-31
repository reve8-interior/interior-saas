import { MousePointer2 } from 'lucide-react';

/** Where the pointer taps, as a percentage of the screenshot. */
export interface TapPoint {
  x: number;
  y: number;
}

export interface Shot {
  /** Screenshot name; files are /landing/<theme>/d<key>.webp (desktop) and m<key>.webp (phone). */
  key: string;
  desktop?: TapPoint | null;
  mobile?: TapPoint | null;
}

/** Animated pointer "tapping" at a point of its (relatively positioned) parent. */
function Tap({ x, y }: { x: number; y: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-10 animate-fade-in"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="absolute -inset-4 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-brand/40" />
      <MousePointer2 className="relative h-6 w-6 -translate-x-1 -translate-y-1 fill-white text-dark-900 drop-shadow-md" />
    </span>
  );
}

/** Light and dark versions of one screenshot; the theme class on <html> picks which shows. */
function ThemedImage({
  src,
  alt,
  eager,
}: {
  src: string;
  alt: string;
  eager: boolean;
}) {
  const loading = eager ? 'eager' : 'lazy';
  return (
    <>
      {/* eslint-disable @next/next/no-img-element */}
      <img
        src={`/landing/light/${src}.webp`}
        alt={alt}
        loading={loading}
        decoding="async"
        className="h-full w-full object-cover dark:hidden"
      />
      <img
        src={`/landing/dark/${src}.webp`}
        alt=""
        loading="lazy"
        decoding="async"
        className="hidden h-full w-full object-cover dark:block"
      />
      {/* eslint-enable @next/next/no-img-element */}
    </>
  );
}

/** Crossfading stack of screenshots; only `active` is visible. */
function Stack({
  shots,
  active,
  prefix,
  alt,
  eager,
}: {
  shots: Shot[];
  active: number;
  prefix: 'd' | 'm';
  alt: string;
  eager: boolean;
}) {
  const tap = prefix === 'd' ? shots[active].desktop : shots[active].mobile;
  return (
    <>
      {shots.map((s, i) => (
        <div
          key={s.key}
          aria-hidden={i !== active}
          className={`absolute inset-0 transition-opacity duration-500 ${
            i === active ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <ThemedImage
            src={`${prefix}${s.key}`}
            alt={i === active ? alt : ''}
            eager={eager && i === 0}
          />
        </div>
      ))}
      {tap && <Tap key={shots[active].key} x={tap.x} y={tap.y} />}
    </>
  );
}

/**
 * Real screenshots of a shared page on a desktop browser with the phone view overlapping it.
 * Pass several shots and an `active` index to crossfade between steps.
 */
export function DeviceShot({
  shots,
  active = 0,
  url,
  alt,
  eager = false,
}: {
  shots: Shot[];
  active?: number;
  /** Address shown in the browser bar. */
  url: string;
  alt: string;
  eager?: boolean;
}) {
  return (
    <div className="relative mx-auto mb-10 max-w-3xl pr-3 sm:pr-8">
      <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-xl">
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
          <span className="flex gap-1" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-dark-300 dark:bg-dark-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-dark-300 dark:bg-dark-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-dark-300 dark:bg-dark-700" />
          </span>
          <span className="mx-auto truncate rounded-md bg-surface px-3 py-0.5 text-[11px] text-dark-500 dark:text-dark-400">
            {url}
          </span>
        </div>
        <div className="relative aspect-[760/600]">
          <Stack
            shots={shots}
            active={active}
            prefix="d"
            alt={alt}
            eager={eager}
          />
        </div>
      </div>

      <div className="absolute -bottom-8 right-0 w-[27%] overflow-hidden rounded-[1.4rem] border-[5px] border-dark-900 bg-surface shadow-2xl dark:border-dark-600">
        <div className="relative aspect-[390/780]">
          <Stack
            shots={shots}
            active={active}
            prefix="m"
            alt={`${alt} (phone)`}
            eager={eager}
          />
        </div>
      </div>
    </div>
  );
}
