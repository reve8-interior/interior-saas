'use client';

import AuthGuard from '@/components/auth/AuthGuard';
import CRMLayout from '@/components/crm/CRMLayout';

export default function DashboardLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <CRMLayout>{children}</CRMLayout>
    </AuthGuard>
  );
}
