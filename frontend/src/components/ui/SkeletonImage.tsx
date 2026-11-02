'use client';

import { useEffect, useRef, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';

import { Skeleton } from './Skeleton';

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  /** Classes for the wrapper (e.g. rounding, a min-height while the image has no intrinsic size yet). */
  wrapperClassName?: string;
};

/**
 * `<img>` that shows a shimmering skeleton until the bitmap has loaded, then fades the image in.
 * The image keeps its own `className`, so it sizes the wrapper exactly as a bare `<img>` would.
 */
export function SkeletonImage({
  src,
  alt,
  className = '',
  wrapperClassName = '',
  onLoad,
  onError,
  ...rest
}: Props) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  const loaded = loadedSrc === src;

  // Cached images can finish before React attaches onLoad.
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) {
      setLoadedSrc(src);
    }
  }, [src]);

  return (
    <span
      className={`relative block overflow-hidden ${loaded ? '' : 'min-h-24'} ${wrapperClassName}`}
    >
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        decoding="async"
        {...rest}
        onLoad={(e) => {
          setLoadedSrc(src);
          onLoad?.(e);
        }}
        onError={(e) => {
          setLoadedSrc(src);
          onError?.(e);
        }}
        className={`transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${className}`}
      />
    </span>
  );
}
