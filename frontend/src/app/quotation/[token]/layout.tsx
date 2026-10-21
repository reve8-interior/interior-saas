import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Quotation',
  robots: { index: false, follow: false },
  // The token lives in this page's URL; never leak it to other origins.
  referrer: 'no-referrer',
};

export default function SharedQuotationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
