import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portfolio',
  // The token lives in this page's URL; never leak it to other origins.
  referrer: 'no-referrer',
};

export default function PortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
