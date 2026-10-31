'use client';

import { getSession, isAuthenticated } from '@/lib/auth';
import { LoadingRegion, PageHeaderSkeleton, Skeleton } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    if (getSession()?.role === 'superadmin') {
      router.push('/admin');
      return;
    }
    setIsAuth(true);
    setIsChecking(false);
  }, [router]);

  if (isChecking) {
    // Mirrors the real shell (themed sidebar + header bar + content) so nothing jumps on hydrate.
    return (
      <LoadingRegion label="Loading workspace" className="min-h-dvh">
        <aside
          aria-hidden="true"
          className="fixed inset-y-0 left-0 hidden w-64 border-r border-side-line bg-side lg:block"
        >
          <div className="flex h-16 items-center border-b border-side-line px-6">
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </aside>
        <div
          aria-hidden="true"
          className="fixed left-64 right-0 top-0 hidden h-16 items-center border-b border-side-line bg-side px-8 lg:flex"
        >
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="p-4 pt-24 sm:p-6 sm:pt-24 lg:pl-72 lg:pt-24">
          <div className="space-y-4">
            <PageHeaderSkeleton />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </LoadingRegion>
    );
  }

  if (!isAuth) return null;
  return <>{children}</>;
}
