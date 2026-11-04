'use client';

import { NavSection } from '@/components/layout/AppSidebar';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  CommandPalette,
  CommandPaletteButton,
} from '@/components/layout/CommandPalette';
import { AccessGate } from '@/components/crm/AccessGate';
import { PasswordGate } from '@/components/crm/PasswordGate';
import { ClientSwitcher } from '@/components/crm/ClientSwitcher';
import { WelcomePrompt } from '@/components/crm/WelcomePrompt';
import { FeedbackPopup } from '@/components/feedback/FeedbackPopup';
import { getSession, signOut } from '@/lib/auth';
import { MARKETING_URL } from '@/lib/constants';
import {
  INBOX_KEY,
  INBOX_POLL_MS,
  getInbox,
  openInboxCount,
  type InboxMessage,
} from '@/lib/inbox';
import { useReplyToasts } from '@/lib/useReplyToasts';
import { api } from '@/lib/api';
import { getMe } from '@/lib/profile';
import { AuthUser } from '@/lib/schemas';
import type { Client } from '@/lib/schemas/client';
import { usageMeters } from '@/lib/usage';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Columns,
  Globe,
  Images,
  LinkSimple,
  SquaresFour,
  Tray,
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
      { name: 'Inbox', href: '/dashboard/inbox', icon: Tray },
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

const WEBSITE_ITEM = {
  name: 'Website',
  href: '/dashboard/website',
  icon: Globe,
};

const TEAM_ITEM = { name: 'Team', href: '/dashboard/team', icon: UserGear };

const CLIENT_PAGE = /^\/dashboard\/clients\/([^/]+)(?:\/|$)/;

/** The id of the client whose workspace is open, if any. */
function clientIdFromPath(pathname: string): string | null {
  const id = CLIENT_PAGE.exec(pathname)?.[1];
  return id && id !== 'new' ? id : null;
}

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Dashboard';
  if (pathname === '/dashboard/board') return 'Board';
  if (pathname === '/dashboard/inbox') return 'Inbox';
  if (pathname.startsWith('/dashboard/clients/new')) return 'New Client';
  if (pathname.startsWith('/dashboard/clients')) return 'Clients';
  if (pathname.startsWith('/dashboard/materials')) return 'Material Library';
  if (pathname === '/dashboard/portfolio') return 'Portfolio';
  if (pathname.startsWith('/dashboard/website')) return 'Website';
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

  // Customer questions still unanswered; the Inbox link shows the count.
  const { data: inbox = [] } = useQuery<InboxMessage[]>({
    queryKey: INBOX_KEY,
    queryFn: getInbox,
    refetchInterval: INBOX_POLL_MS,
    refetchOnWindowFocus: true,
  });
  const inboxOpen = openInboxCount(inbox);

  // Only business admins manage the team and the website.
  const sections = useMemo<NavSection[]>(() => {
    const isAdmin = user?.roles.includes('admin');
    return navigationSections.map((section) => ({
      ...section,
      items: [
        ...(isAdmin && section.title === 'Manage' ? [TEAM_ITEM] : []),
        ...section.items.flatMap((item) => {
          if (item.href === '/dashboard/inbox')
            return [{ ...item, badge: inboxOpen }];
          // Website settings are admin-only; sits right after Portfolio.
          if (item.href === '/dashboard/portfolio')
            return isAdmin ? [item, WEBSITE_ITEM] : [item];
          return [item];
        }),
      ],
    }));
  }, [user, inboxOpen]);

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
      pageTitle={
        clientId ? (
          <ClientSwitcher
            clientId={clientId}
            name={client?.name}
            pathname={pathname}
          />
        ) : (
          getPageTitle(pathname)
        )
      }
      bgClass="bg-transparent"
      headerExtra={<CommandPaletteButton />}
      user={user}
      onLogout={() => {
        signOut();
        window.location.assign(MARKETING_URL);
      }}
    >
      <CommandPalette pages={pages} />
      <PasswordGate required={me?.must_change_password}>
        <AccessGate
          access={me?.access}
          meters={usageMeters(me?.usage ?? [], me?.ai)}
        >
          {children}
        </AccessGate>
      </PasswordGate>
      {/* Viewers are read-only, so they can neither answer nor load a sample. */}
      {user &&
        me &&
        !me.must_change_password &&
        !user.roles.includes('viewer') && (
          <>
            <WelcomePrompt userId={user.id} />
            <FeedbackPopup userId={user.id} />
          </>
        )}
    </AppLayout>
  );
}
