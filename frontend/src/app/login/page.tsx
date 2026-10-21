'use client';

import { LoginForm } from '@/components/auth/LoginForm';
import { signIn } from '@/lib/auth';
import { Paintbrush } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';

function PortalLoginForm() {
  const router = useRouter();

  const handleSubmit = async (email: string, password: string) => {
    await signIn(email, password);
    router.push('/dashboard');
  };

  return (
    <LoginForm
      icon={<Paintbrush className="h-7 w-7" />}
      title="Welcome back"
      subtitle="Sign in to manage your clients and projects"
      portalLabel="Studio Portal"
      onSubmit={handleSubmit}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <PortalLoginForm />
    </Suspense>
  );
}
