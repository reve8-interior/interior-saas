'use client';

import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicProject } from '@/lib/schemas/site';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { designFullSrc, hasText, projectMeta, projectRooms } from './siteUtils';

interface ProjectOverlayProps {
  project: PublicProject;
  onClose: () => void;
}

/** Horizontal travel (px) that counts as a swipe on touch screens. */
const SWIPE_MIN = 48;

/**
 * Full-screen project view: image stage with prev/next (buttons, arrow keys, swipe), a thumbnail rail, and
 * the project story beside it. Esc or the close button leaves; focus is trapped inside and returned to the
 * card on close, and the page behind does not scroll.
 */
export function ProjectOverlay({ project, onClose }: ProjectOverlayProps) {
  const designs = project.designs;
  const total = designs.length;
  const [index, setIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  useFocusTrap(panelRef, true);

  const go = useCallback(
    (step: number) => {
      if (total > 0) setIndex((i) => (i + step + total) % total);
    },
    [total]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, go]);

  // Scroll lock: restore whatever the body had before, not a hardcoded value.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const current = total > 0 ? designs[index] : null;
  const src = current ? designFullSrc(current) : null;
  const meta = projectMeta(project);
  const rooms = projectRooms(project);
  const currentRooms = new Set(current?.rooms ?? []);
  const imageAlt = current?.title || `${project.title}, image ${index + 1}`;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={project.title}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-[rgb(var(--deep-2))] text-white motion-safe:animate-fade-in lg:flex-row lg:overflow-hidden"
    >
      {/* Not `position: fixed`: useFocusTrap skips elements whose offsetParent is null, which fixed ones
          always are. A zero-height sticky bar keeps it top-right while the phone layout scrolls; on lg the
          panel does not scroll, so it is pinned absolutely. It is first in the DOM, so it takes focus first. */}
      <div className="pointer-events-none sticky top-0 z-10 flex h-0 shrink-0 justify-end lg:absolute lg:inset-x-0 lg:top-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close project"
          className="pointer-events-auto mr-3 mt-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 sm:mr-5 sm:mt-5"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>

      {/* Stage */}
      <div className="relative flex min-h-[62svh] shrink-0 flex-col lg:min-h-0 lg:flex-1">
        <div
          className="relative flex flex-1 items-center justify-center px-2 pb-2 pt-16 sm:px-16 lg:py-14"
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX;
            touchX.current = null;
            if (start === null || end === undefined) return;
            if (Math.abs(end - start) >= SWIPE_MIN) go(end < start ? 1 : -1);
          }}
        >
          {current ? (
            src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={current.id}
                src={src}
                alt={imageAlt}
                className="max-h-[56svh] w-auto max-w-full select-none object-contain motion-safe:animate-fade-in lg:max-h-[calc(100svh-11rem)]"
              />
            ) : (
              <p className="text-sm text-white/60">
                This image is not available.
              </p>
            )
          ) : (
            <p className="max-w-xs text-center font-display text-2xl font-light text-white/70">
              Images for this project are coming soon.
            </p>
          )}

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous image"
                className="absolute left-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/30 backdrop-blur transition-colors hover:bg-white/15 sm:inline-flex"
              >
                <ArrowLeft aria-hidden className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next image"
                className="absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/30 backdrop-blur transition-colors hover:bg-white/15 sm:inline-flex"
              >
                <ArrowRight aria-hidden className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {current && (
          <div className="flex items-center justify-between gap-4 px-4 pb-3 text-xs text-white/60 sm:px-16">
            <span className="truncate">
              {current.title}
              {hasText(current.description) && (
                <span className="text-white/45"> — {current.description}</span>
              )}
            </span>
            <span aria-live="polite" className="shrink-0 tabular-nums">
              {index + 1} / {total}
            </span>
          </div>
        )}

        {total > 1 && (
          <ul
            aria-label="Images"
            className="flex gap-2 overflow-x-auto px-4 pb-4 pt-1 sm:px-16 lg:pb-6"
          >
            {designs.map((d, i) => {
              const thumb = d.thumb_url ?? d.image_url;
              return (
                <li key={d.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Show image ${i + 1}`}
                    aria-current={i === index ? 'true' : undefined}
                    className={`block h-14 w-20 overflow-hidden rounded-sm bg-white/10 ring-offset-2 ring-offset-[rgb(var(--deep-2))] transition ${i === index ? 'opacity-100 ring-2 ring-white' : 'opacity-50 hover:opacity-90'}`}
                  >
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Story */}
      <aside className="border-t border-white/10 px-5 py-8 sm:px-16 lg:w-[26rem] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-10 lg:py-20">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-white/55">
          {hasText(project.category) && (
            <span className="text-secondary-300">{project.category}</span>
          )}
          {meta && <span>{meta}</span>}
        </div>
        <h2 className="mt-4 font-display text-3xl font-light leading-tight tracking-tight sm:text-4xl">
          {project.title}
        </h2>
        {hasText(project.story) && (
          <p className="mt-6 whitespace-pre-line text-[0.95rem] leading-relaxed text-white/75">
            {project.story}
          </p>
        )}
        {rooms.length > 0 && (
          <div className="mt-8">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/45">
              Rooms
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {rooms.map((r) => (
                <li
                  key={r}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${currentRooms.has(r) ? 'border-white bg-white text-[rgb(var(--deep-2))]' : 'border-white/25 text-white/75'}`}
                >
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
