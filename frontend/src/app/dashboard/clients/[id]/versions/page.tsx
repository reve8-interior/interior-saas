'use client';

import { useParams } from 'next/navigation';
import { VersionsView } from '@/components/quotation/VersionsView';

/** The "Versions" tab of the client workspace. */
export default function VersionsPage() {
  const { id } = useParams<{ id: string }>();
  return <VersionsView clientId={id} />;
}
