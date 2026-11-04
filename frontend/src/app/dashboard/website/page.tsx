'use client';

import { BrandingUploader } from '@/components/website/BrandingUploader';
import { ProjectsManager } from '@/components/website/ProjectsManager';
import { PublishBar } from '@/components/website/PublishBar';
import { SiteProfileForm } from '@/components/website/SiteProfileForm';
import { SlugField } from '@/components/website/SlugField';
import { ThemePicker } from '@/components/website/ThemePicker';
import { ErrorState, PageSkeleton } from '@/components/ui';
import { Collapsible } from '@/components/ui/Collapsible';
import { CARD_CLS } from '@/lib/constants';
import { errorMessage } from '@/lib/errors';
import type {
  SiteSettings,
  SiteSettingsInput,
  SiteTheme,
} from '@/lib/schemas/site';
import {
  clearSlug,
  getSiteSettings,
  listProjects,
  publishSite,
  setSlug,
  unpublishSite,
  updateSiteSettings,
} from '@/lib/site';
import { SITE_THEMES, suggestThemes } from '@/lib/siteThemes';
import { publicSitePath } from '@/lib/siteUrl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const SITE_KEY = ['site-settings'];

export default function WebsitePage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: SITE_KEY,
    queryFn: getSiteSettings,
  });

  const { data: projects } = useQuery({
    queryKey: ['site-projects'],
    queryFn: listProjects,
  });

  const store = (next: SiteSettings) =>
    queryClient.setQueryData(SITE_KEY, next);
  const onError = (err: unknown) => toast.error(errorMessage(err));

  const slugMutation = useMutation({
    mutationFn: setSlug,
    onSuccess: (next) => {
      store(next);
      toast.success('Web address saved');
    },
    onError,
  });
  const clearMutation = useMutation({
    mutationFn: clearSlug,
    onSuccess: (next) => {
      store(next);
      toast.success('Public address removed');
    },
    onError,
  });
  const saveMutation = useMutation({
    mutationFn: (input: SiteSettingsInput) => updateSiteSettings(input),
    onSuccess: (next) => {
      store(next);
      toast.success('Website saved');
    },
    onError,
  });
  const themeMutation = useMutation({
    mutationFn: (theme: SiteTheme) => updateSiteSettings({ theme }),
    onSuccess: (next) => {
      store(next);
      toast.success('Theme saved');
    },
    onError,
  });
  const publishMutation = useMutation({
    mutationFn: (publish: boolean) =>
      publish ? publishSite() : unpublishSite(),
    onSuccess: (next) => {
      store(next);
      toast.success(
        next.published ? 'Website published' : 'Website unpublished'
      );
    },
    onError,
  });

  if (isLoading) return <PageSkeleton />;
  if (isError || !data)
    return (
      <ErrorState onRetry={() => refetch()}>
        Couldn&apos;t load your website settings.
      </ErrorState>
    );

  const slugField = (
    <SlugField
      value={data.slug}
      saving={slugMutation.isPending}
      onSave={(slug) => slugMutation.mutate(slug)}
      onClear={() => clearMutation.mutate()}
      clearing={clearMutation.isPending}
      publicOnSave={data.mode === 'gallery'}
    />
  );

  if (data.mode === 'gallery') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className={CARD_CLS}>{slugField}</div>
        {data.slug && (
          <a
            href={publicSitePath(data.slug)}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary inline-flex"
          >
            View your gallery
          </a>
        )}
        <Collapsible title="Projects">
          <ProjectsManager paid={false} />
        </Collapsible>
        <div className={`${CARD_CLS} space-y-1`}>
          <h2 className="font-heading text-lg font-extrabold">
            Get a full website
          </h2>
          <p className="text-sm text-dark-600 dark:text-dark-300">
            Paid plans add a full website with your logo, hero image, about
            section, services and projects. Upgrade to unlock it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PublishBar
        slug={data.slug}
        published={data.published}
        busy={publishMutation.isPending}
        onPublish={() => publishMutation.mutate(true)}
        onUnpublish={() => publishMutation.mutate(false)}
      />
      <Collapsible title="Web address" summary={data.slug}>
        {slugField}
      </Collapsible>
      <Collapsible title="Logo and hero image">
        <div className="grid gap-4 sm:grid-cols-2">
          <BrandingUploader
            kind="logo"
            label="Logo"
            currentUrl={data.logo_url}
            onUploaded={(url) => store({ ...data, logo_url: url })}
          />
          <BrandingUploader
            kind="hero"
            label="Hero image"
            currentUrl={data.hero_url}
            onUploaded={(url) => store({ ...data, hero_url: url })}
          />
        </div>
      </Collapsible>
      <Collapsible
        title="Colours and fonts"
        summary={SITE_THEMES.find((t) => t.key === data.theme)?.name}
      >
        <ThemePicker
          value={data.theme}
          suggested={suggestThemes((projects ?? []).map((p) => p.category))}
          saving={themeMutation.isPending}
          onSelect={(theme) => themeMutation.mutate(theme)}
        />
      </Collapsible>
      <SiteProfileForm
        settings={data}
        saving={saveMutation.isPending}
        onSave={(input) => saveMutation.mutate(input)}
      >
        <Collapsible
          title="Projects"
          summary={
            projects
              ? `${projects.length} project${projects.length === 1 ? '' : 's'}`
              : null
          }
        >
          <ProjectsManager paid />
        </Collapsible>
      </SiteProfileForm>
    </div>
  );
}
