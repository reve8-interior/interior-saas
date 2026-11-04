interface SiteImageProps {
  src: string | null;
  alt: string;
  /** Classes for the box; set its aspect ratio (or size) here so the layout never shifts. */
  className?: string;
  /** Classes for the <img> itself (hover zoom etc.). */
  imgClassName?: string;
  /** Hero images load eagerly; everything below the fold is lazy. */
  eager?: boolean;
}

/**
 * Plain <img> inside a sized box: object-cover fills it, and a soft tonal placeholder shows while it
 * loads or when there is no URL at all. Next/Image is not used because the URLs are signed storage
 * links on arbitrary hosts.
 */
export function SiteImage({
  src,
  alt,
  className = '',
  imgClassName = '',
  eager = false,
}: SiteImageProps) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-surface-2 via-surface to-surface-2 ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover ${imgClassName}`}
        />
      ) : (
        <span
          role="img"
          aria-label={alt}
          className="absolute inset-0 flex items-center justify-center font-display text-6xl font-light italic text-text/30"
        >
          {alt.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
