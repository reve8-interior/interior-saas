import { ApiError } from '@/lib/api';

/** A link that was turned off or expired is permanent; anything else is worth retrying. */
export function isLinkGone(error: unknown): boolean {
  return error instanceof ApiError && [403, 404, 410].includes(error.status);
}

/** Full-page message for a shared link that cannot be shown, with a retry for transient failures. */
export function SharedLinkError({
  subject,
  gone,
  onRetry,
}: {
  /** What the link pointed to, e.g. "quotation". */
  subject: string;
  gone: boolean;
  onRetry: () => void;
}) {
  return (
    <main
      role="alert"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="font-heading text-xl font-semibold text-text">
        {gone
          ? `This ${subject} link is no longer available`
          : `We couldn't load this ${subject}`}
      </h1>
      <p className="text-sm text-muted">
        {gone
          ? 'It has expired or the designer turned it off. Please ask them to send a new link.'
          : 'This looks like a connection problem, not a problem with the link. Please try again.'}
      </p>
      {!gone && (
        <button type="button" onClick={onRetry} className="btn-primary">
          Try again
        </button>
      )}
    </main>
  );
}
