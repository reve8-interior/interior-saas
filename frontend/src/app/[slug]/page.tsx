'use client';

import { notFound, useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SiteGallery } from '@/components/site/SiteGallery';
import { SiteTemplate } from '@/components/site/SiteTemplate';
import { SharedLinkError } from '@/components/shared/SharedLinkError';
import {
  GridSkeleton,
  LoadingRegion,
  PageHeaderSkeleton,
} from '@/components/ui';
import { useSharedLink } from '@/lib/hooks/useSharedLink';
import { getPublicSite } from '@/lib/site';

/** Public designer website (or gallery) at the business's slug. */
export default function PublicSitePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { state, retry } = useSharedLink(slug, getPublicSite);

  const view = state.status === 'ready' ? state.view : null;
  const redirectTo =
    view?.mode === 'redirect' && view.slug !== slug ? view.slug : null;

  useEffect(() => {
    if (redirectTo) router.replace('/' + redirectTo);
  }, [redirectTo, router]);

  if (state.status === 'unavailable') {
    if (state.gone) notFound();
    return <SharedLinkError subject="page" gone={false} onRetry={retry} />;
  }

  if (!view || view.mode === 'redirect') {
    return (
      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        <LoadingRegion label="Loading portfolio" className="space-y-6">
          <PageHeaderSkeleton />
          <GridSkeleton items={6} itemClassName="h-56" />
        </LoadingRegion>
      </main>
    );
  }

  return view.mode === 'gallery' ? (
    <SiteGallery view={view} />
  ) : (
    <SiteTemplate view={view} />
  );
}
