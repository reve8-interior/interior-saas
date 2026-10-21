import { Toaster } from 'sonner';
import { ThemeProvider, ReactQueryProvider } from '@/components/providers';
import DashboardLayoutWrapper from './DashboardLayoutWrapper';

export const metadata = {
  title: { default: 'reve8 Studio', template: '%s | reve8' },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <ReactQueryProvider>
        <DashboardLayoutWrapper>{children}</DashboardLayoutWrapper>
        <Toaster richColors position="bottom-right" />
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
