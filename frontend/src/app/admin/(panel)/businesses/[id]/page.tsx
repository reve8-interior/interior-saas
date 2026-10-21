'use client';

import { AccessBadge, StatusBadge } from '@/components/admin/AccessBadge';
import BusinessDetailTabs, {
  BusinessTab,
} from '@/components/admin/BusinessDetailTabs';
import { BusinessFormModal } from '@/components/admin/BusinessFormModal';
import { getAdminOverview } from '@/lib/adminMonitor';
import { ApiError } from '@/lib/api';
import { listBusinesses, setBusinessActive } from '@/lib/businesses';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Power } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { PageLoader } from '@/components/ui';

const UNASSIGNED = 'unassigned';
const TABS: BusinessTab[] = ['overview', 'clients', 'users', 'ai', 'usage'];

function BusinessDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: getAdminOverview,
  });
  const list = useQuery({ queryKey: ['businesses'], queryFn: listBusinesses });

  const toggle = useMutation({
    mutationFn: (active: boolean) => setBusinessActive(id, active),
    onSuccess: (b) => {
      toast.success(`${b.name} ${b.is_active ? 'activated' : 'deactivated'}`);
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Something went wrong'
      ),
  });

  const requested = searchParams.get('tab') as BusinessTab | null;
  const tab: BusinessTab =
    requested && TABS.includes(requested) ? requested : 'overview';
  const setTab = (next: BusinessTab) =>
    router.replace(`/admin/businesses/${id}?tab=${next}`, { scroll: false });

  if (overview.isLoading || list.isLoading) return <PageLoader />;

  const usage = overview.data?.businesses.find(
    (b) => (b.id ?? UNASSIGNED) === id
  );
  const business = list.data?.find((b) => b.id === id) ?? null;

  if (!usage)
    return (
      <div className="surface space-y-3 p-6 text-center">
        <p className="font-medium">Business not found.</p>
        <Link href="/admin/businesses" className="btn-secondary inline-flex">
          Back to businesses
        </Link>
      </div>
    );

  return (
    <div className="space-y-5">
      <Link
        href="/admin/businesses"
        className="link-action-muted inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Businesses
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-2xl font-extrabold tracking-tight">
            {usage.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge active={usage.is_active} />
            {business && <AccessBadge b={business} />}
            {business && (business.contact_email || business.contact_phone) && (
              <span className="text-xs text-dark-500 dark:text-dark-400">
                {[business.contact_email, business.contact_phone]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </div>
        </div>

        {business && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEditOpen(true)} className="btn-secondary">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={() => toggle.mutate(!business.is_active)}
              disabled={toggle.isPending}
              className={business.is_active ? 'btn-danger-soft' : 'btn-success'}
            >
              <Power className="h-4 w-4" />
              {business.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        )}
      </div>

      <BusinessDetailTabs business={usage} tab={tab} onTab={setTab} />

      {business && (
        <BusinessFormModal
          key={`${business.id}-${editOpen}`}
          open={editOpen}
          business={business}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

export default function BusinessDetailPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <BusinessDetail />
    </Suspense>
  );
}
