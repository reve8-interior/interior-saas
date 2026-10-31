import { ThemeProvider } from '@/components/providers';

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
