'use client';

import { AppLayout } from '@/components/layout/AppLayout';
import { NavSection } from '@/components/layout/AppSidebar';
import { getSession, signOut } from '@/lib/auth';
import { AuthUser } from '@/lib/schemas';
import { Buildings, SquaresFour, Tag } from '@phosphor-icons/react';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';

const sections: NavSection[] = [
  {
    title: 'Platform',
    items: [
      { name: 'Overview', href: '/admin', icon: SquaresFour },
      { name: 'Businesses', href: '/admin/businesses', icon: Buildings },
      { name: 'Plans', href: '/admin/plans', icon: Tag },
    ],
  },
];

function getTitle(pathname: string): string {
  if (pathname.startsWith('/admin/businesses')) return 'Businesses';
  if (pathname.startsWith('/admin/plans')) return 'Plans';
  if (pathname.startsWith('/admin/settings')) return 'Settings';
  return 'Overview';
}

/** Auth guard + layout for the superadmin console. */
export default function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== 'superadmin') {
      router.replace('/admin/login');
      return;
    }
    setUser({
      id: session.userId,
      email: session.email,
      full_name: null,
      roles: [session.role],
    });
  }, [router]);

  if (!user) return null;

  return (
    <AppLayout
      sections={sections}
      label="Admin"
      showVersion
      rootHref="/admin"
      pageTitle={getTitle(pathname)}
      bgClass="bg-transparent"
      user={user}
      onLogout={() => {
        signOut();
        window.location.assign('/admin/login');
      }}
    >
      {children}
    </AppLayout>
  );
}
