import { Toaster } from 'sonner';
import { ThemeProvider, ReactQueryProvider } from '@/components/providers';

export const metadata = {
  title: { default: 'Admin', template: '%s | Admin' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <ReactQueryProvider>
        {children}
        <Toaster richColors position="bottom-right" />
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
