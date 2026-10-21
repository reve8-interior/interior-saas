import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Design preview',
  robots: { index: false, follow: false },
  // The token lives in this page's URL; never leak it to other origins.
  referrer: 'no-referrer',
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
