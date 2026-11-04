import { SiteImage } from './SiteImage';
import { SECTION_IDS } from './siteUtils';

interface StudioSectionProps {
  businessName: string;
  about: string;
  /** An image to sit beside the text; the hero photo when there is one. */
  imageUrl: string | null;
}

/**
 * Splits the about text into a pull quote (its first sentence) and the rest. Short, single-sentence
 * text is shown as the quote alone.
 */
function splitAbout(about: string): { quote: string; rest: string } {
  const text = about.trim();
  const match = text.match(/^(.{20,240}?[.!?])\s+([\s\S]+)$/);
  if (!match) return { quote: text, rest: '' };
  return { quote: match[1], rest: match[2].trim() };
}

/** The studio's own words: a large serif pull quote, the remaining story, and a tall image. */
export function StudioSection({
  businessName,
  about,
  imageUrl,
}: StudioSectionProps) {
  const { quote, rest } = splitAbout(about);

  return (
    <section
      id={SECTION_IDS.studio}
      aria-labelledby="site-studio-title"
      className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-8 sm:py-28"
    >
      <div
        className={`grid gap-12 ${imageUrl ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-20' : ''}`}
      >
        <div>
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.28em] text-accent-text">
            The studio
          </p>
          <h2 id="site-studio-title" className="sr-only">
            About {businessName}
          </h2>
          <blockquote className="mt-6 max-w-3xl border-l-2 border-brand pl-6 font-display text-3xl font-light italic leading-snug tracking-tight text-text sm:text-4xl">
            {quote}
          </blockquote>
          {rest && (
            <p className="mt-8 max-w-2xl whitespace-pre-line text-base leading-relaxed text-muted">
              {rest}
            </p>
          )}
          <p className="mt-8 text-[0.7rem] uppercase tracking-[0.2em] text-faint">
            — {businessName}
          </p>
        </div>
        {imageUrl && (
          <SiteImage
            src={imageUrl}
            alt={`${businessName} studio`}
            className="aspect-[4/5] rounded-md max-lg:hidden"
          />
        )}
      </div>
    </section>
  );
}
