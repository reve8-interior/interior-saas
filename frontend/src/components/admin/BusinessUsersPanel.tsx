'use client';

import { TeamManager } from '@/components/team/TeamManager';
import { businessTeamApi } from '@/lib/team';
import { useMemo } from 'react';

/** Platform-admin view of a business's team: members, seats and activity. */
export function BusinessUsersPanel({ businessId }: { businessId: string }) {
  const api = useMemo(() => businessTeamApi(businessId), [businessId]);
  return <TeamManager api={api} />;
}
