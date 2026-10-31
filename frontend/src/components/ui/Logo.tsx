interface LogoProps {
  /** `brand` draws the mark and "reve" in the button colour; `onBrand` sits it on a brand tile, all white (coloured sidebar). */
  tone?: 'brand' | 'onBrand';
  /** Height of the mark in px; the wordmark scales with it. */
  size?: number;
  /** Show only the mark (collapsed sidebar). */
  markOnly?: boolean;
}

/** Inter's lowercase body sits below the line box's centre; lift the wordmark so it lines up with the mark's centre. */
const WORDMARK_LIFT = 'translateY(-0.06em)';

/** The mark is /icon.svg used as a mask, so it takes its colour from the theme instead of the file's fixed blue. */
function Mark({ size, className }: { size: number; className: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: size * 1.755,
        height: size,
        maskImage: 'url(/icon.svg)',
        WebkitMaskImage: 'url(/icon.svg)',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  );
}

/** reve8 logo. Its colour is the primary button colour (`bg-brand`) so the brand reads as one blue. */
export function Logo({
  tone = 'brand',
  size = 22,
  markOnly = false,
}: LogoProps) {
  if (tone === 'onBrand') {
    return (
      <span className="inline-flex items-center gap-2.5">
        <span
          className="flex shrink-0 items-center justify-center rounded-control bg-brand"
          style={{ width: size * 1.7, height: size * 1.7 }}
        >
          <Mark size={size * 0.8} className="bg-white" />
        </span>
        {!markOnly && (
          <span
            className="font-heading font-bold leading-none tracking-tight text-white"
            style={{ fontSize: size * 1.25, transform: WORDMARK_LIFT }}
          >
            reve8
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={size} className="bg-brand" />
      {!markOnly && (
        <span
          className="font-heading font-bold leading-none tracking-tight"
          style={{ fontSize: size * 1.3, transform: WORDMARK_LIFT }}
        >
          <span className="text-brand">reve</span>
          <span className="text-text">8</span>
        </span>
      )}
    </span>
  );
}
