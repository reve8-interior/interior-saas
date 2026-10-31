'use client';

import { NavSection } from '@/components/layout/AppSidebar';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  CommandPalette,
  CommandPaletteButton,
} from '@/components/layout/CommandPalette';
import { AccessGate } from '@/components/crm/AccessGate';
import { PasswordGate } from '@/components/crm/PasswordGate';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { getSession, signOut } from '@/lib/auth';
import { useReplyToasts } from '@/lib/useReplyToasts';
import { api } from '@/lib/api';
import { getMe } from '@/lib/profile';
import { AuthUser } from '@/lib/schemas';
import type { Client } from '@/lib/schemas/client';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Columns,
  Images,
  LinkSimple,
  SquaresFour,
  UserGear,
  Users,
  Wrench,
} from '@phosphor-icons/react';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';

const navigationSections: NavSection[] = [
  {
    title: 'Portal',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: SquaresFour },
      {
        name: 'Clients',
        href: '/dashboard/board',
        icon: Users,
        alsoActiveOn: ['/dashboard/clients'],
      },
      {
        name: 'Portfolio',
        href: '/dashboard/portfolio',
        icon: Images,
      },
      {
        name: 'Shared links',
        tabLabel: 'Links',
        href: '/dashboard/shared',
        icon: LinkSimple,
      },
      {
        name: 'Material Library',
        tabLabel: 'Materials',
        href: '/dashboard/materials',
        icon: Wrench,
      },
    ],
  },
  {
    title: 'Manage',
    items: [
      {
        name: 'Quotation Columns',
        href: '/dashboard/settings/columns',
        icon: Columns,
      },
      { name: 'Guide', href: '/dashboard/guide', icon: BookOpen },
    ],
  },
];

const TEAM_ITEM = { name: 'Team', href: '/dashboard/team', icon: UserGear };

const CLIENT_PAGE = /^\/dashboard\/clients\/([^/]+)(?:\/|$)/;

/** The id of the client whose workspace is open, if any. */
function clientIdFromPath(pathname: string): string | null {
  const id = CLIENT_PAGE.exec(pathname)?.[1];
  return id && id !== 'new' ? id : null;
}

function getPageTitle(pathname: string, clientName?: string): string {
  if (pathname === '/dashboard') return 'Dashboard';
  if (pathname === '/dashboard/board') return 'Board';
  if (pathname.startsWith('/dashboard/clients/new')) return 'New Client';
  if (clientIdFromPath(pathname)) return clientName ?? 'Client';
  if (pathname.startsWith('/dashboard/clients')) return 'Clients';
  if (pathname.startsWith('/dashboard/materials')) return 'Material Library';
  if (pathname === '/dashboard/portfolio') return 'Portfolio';
  if (pathname === '/dashboard/shared') return 'Shared links';
  if (pathname === '/dashboard/guide') return 'Guide';
  if (pathname === '/dashboard/team') return 'Team';
  if (pathname === '/dashboard/settings') return 'Settings';
  if (pathname.startsWith('/dashboard/settings/columns'))
    return 'Quotation Columns';
  return 'Portal';
}

export default function CRMLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) {
      setUser({
        id: session.userId,
        email: session.email,
        full_name: null,
        roles: [session.role],
      });
    }
  }, []);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
  });

  // Only business admins manage the team.
  const sections = useMemo<NavSection[]>(
    () =>
      user?.roles.includes('admin')
        ? navigationSections.map((section) =>
            section.title === 'Manage'
              ? { ...section, items: [TEAM_ITEM, ...section.items] }
              : section
          )
        : navigationSections,
    [user]
  );

  const pages = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections]
  );

  useReplyToasts();
  const clientId = clientIdFromPath(pathname);
  const { data: client } = useQuery<Client>({
    queryKey: ['client', clientId],
    queryFn: () => api.get<Client>(`/clients/${clientId}`),
    enabled: clientId !== null,
  });

  return (
    <AppLayout
      sections={sections}
      businessName={me?.business_name}
      businessLoading={meLoading}
      access={me?.access}
      label="Studio"
      rootHref="/dashboard"
      pageTitle={getPageTitle(pathname, client?.name)}
      bgClass="bg-transparent"
      headerExtra={
        <>
          <CommandPaletteButton />
          <NotificationBell />
        </>
      }
      mobileExtra={<NotificationBell />}
      user={user}
      onLogout={() => {
        signOut();
        router.push('/login');
      }}
    >
      <CommandPalette pages={pages} />
      <PasswordGate required={me?.must_change_password}>
        <AccessGate access={me?.access}>{children}</AccessGate>
      </PasswordGate>
    </AppLayout>
  );
}
