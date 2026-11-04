'use client';

import { publicSitePath } from '@/lib/siteUrl';
import Link from 'next/link';

interface PublishBarProps {
  slug: string | null;
  published: boolean;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
}

/** Publish state, the publish toggle and links to preview or view the site. */
export function PublishBar({
  slug,
  published,
  busy,
  onPublish,
  onUnpublish,
}: PublishBarProps) {
  return (
    <div className="surface flex flex-wrap items-center gap-3 p-4">
      <div className="mr-auto">
        <p className="font-heading font-bold">
          {published ? 'Published' : 'Not published'}
        </p>
        {!slug && (
          <p className="text-sm text-dark-500">
            Choose a web address before you publish.
          </p>
        )}
      </div>
      <Link href="/dashboard/website/preview" className="btn-secondary">
        Preview
      </Link>
      {published && slug && (
        <a
          href={publicSitePath(slug)}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
        >
          View live site
        </a>
      )}
      {published ? (
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={onUnpublish}
        >
          {busy ? 'Working…' : 'Unpublish'}
        </button>
      ) : (
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !slug}
          onClick={onPublish}
        >
          {busy ? 'Working…' : 'Publish'}
        </button>
      )}
    </div>
  );
}
