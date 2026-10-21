'use client';

import { TeamManager } from '@/components/team/TeamManager';
import { usePermissions } from '@/lib/hooks';
import { ownTeamApi } from '@/lib/team';

export default function TeamPage() {
  const { role, userId } = usePermissions();
  if (role !== 'admin') {
    return (
      <p className="surface p-6 text-center text-sm text-dark-500 dark:text-dark-400">
        Only business admins can manage the team.
      </p>
    );
  }
  return <TeamManager api={ownTeamApi} selfId={userId} manageClientAccess />;
}
