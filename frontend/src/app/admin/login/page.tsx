'use client';

import { LoginForm } from '@/components/auth/LoginForm';
import { signInAdmin } from '@/lib/auth';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();

  const handleSubmit = async (email: string, password: string) => {
    await signInAdmin(email, password);
    router.push('/admin');
  };

  return (
    <LoginForm
      icon={<ShieldCheck className="h-7 w-7" />}
      title="Admin Console"
      subtitle="Sign in to manage businesses"
      portalLabel="Admin"
      onSubmit={handleSubmit}
    />
  );
}
