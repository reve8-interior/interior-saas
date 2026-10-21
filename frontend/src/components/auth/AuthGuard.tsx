'use client';

import { getSession, isAuthenticated } from '@/lib/auth';
import { Skeleton } from '@/components/ui';
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
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!isAuth) return null;
  return <>{children}</>;
}
