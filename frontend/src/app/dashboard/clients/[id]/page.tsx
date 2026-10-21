'use client';

import { useParams } from 'next/navigation';
import { ClientDetail } from '@/components/crm/ClientDetail';
import { ClientAccessCard } from '@/components/team/ClientAccessCard';
import { usePermissions } from '@/lib/hooks';

/** The "Details" tab of the client workspace. */
export default function ClientDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = usePermissions();
  return (
    <ClientDetail
      clientId={id}
      aside={role === 'admin' ? <ClientAccessCard clientId={id} /> : null}
    />
  );
}
