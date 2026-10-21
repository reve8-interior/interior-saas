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
    // Mirrors the real shell (dark sidebar + content) so nothing jumps on hydrate.
    return (
      <LoadingRegion label="Loading workspace" className="min-h-dvh">
        <aside
          aria-hidden="true"
          className="fixed inset-y-0 left-0 hidden w-64 space-y-3 bg-dark-900 p-4 lg:block"
        >
          <Skeleton className="h-8 w-32 !bg-white/10" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full !bg-white/10" />
          ))}
        </aside>
        <div className="p-4 pt-24 sm:p-6 sm:pt-24 lg:pl-72 lg:pt-6">
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
