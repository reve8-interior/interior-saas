'use client';

import { AppLayout } from '@/components/layout/AppLayout';
import { NavSection } from '@/components/layout/AppSidebar';
import { getSession, signOut } from '@/lib/auth';
import { AuthUser } from '@/lib/schemas';
import { Building2, LayoutDashboard } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';

const sections: NavSection[] = [
  {
    title: 'Platform',
    items: [
      { name: 'Overview', href: '/admin', icon: LayoutDashboard },
      { name: 'Businesses', href: '/admin/businesses', icon: Building2 },
    ],
  },
];

function getTitle(pathname: string): string {
  if (pathname.startsWith('/admin/businesses')) return 'Businesses';
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
        router.push('/admin/login');
      }}
    >
      {children}
    </AppLayout>
  );
}
