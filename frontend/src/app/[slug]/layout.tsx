import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/providers';

export const metadata: Metadata = { title: 'Portfolio' };

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
