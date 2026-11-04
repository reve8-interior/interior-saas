'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SiteGallery } from '@/components/site/SiteGallery';
import { SiteTemplate } from '@/components/site/SiteTemplate';
import { ErrorState, PageSkeleton } from '@/components/ui';
import { getSitePreview, getSiteSettings } from '@/lib/site';

/** Owner-only preview of what the public page will show. */
export default function WebsitePreviewPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['site-preview'],
    queryFn: getSitePreview,
  });

  const settings = useQuery({
    queryKey: ['site-settings'],
    queryFn: getSiteSettings,
  });
  const site = settings.data;
  let banner = 'Preview';
  if (site?.mode === 'gallery')
    banner = `Your gallery is already public${site.slug ? ` at /${site.slug}` : ' once you choose an address'}`;
  else if (site?.mode === 'site')
    banner = site.published
      ? 'Preview — your site is live'
      : 'Preview — not public yet';

  return (
    <div className="space-y-4">
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
      >
        <span>{banner}</span>
        <Link href="/dashboard/website" className="font-medium underline">
          Back to website settings
        </Link>
      </div>
      {isLoading ? (
        <PageSkeleton />
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : data.mode === 'gallery' ? (
        <SiteGallery view={data} />
      ) : (
        <SiteTemplate view={data} />
      )}
    </div>
  );
}
