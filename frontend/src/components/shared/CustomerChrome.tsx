'use client';

import { Moon, Printer, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/ThemeProvider';

/** Light/dark toggle for public customer pages. */
export function ThemeButton() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-text transition-colors hover:bg-surface-2 print:hidden"
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" aria-hidden />
      ) : (
        <Moon className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}

/** Opens the browser print dialog, where the customer can choose "Save as PDF". */
export function PrintButton({ beforePrint }: { beforePrint?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        beforePrint?.();
        // Let React render any expanded content before the print dialog opens.
        setTimeout(() => window.print(), 100);
      }}
      aria-label="Print or save as PDF"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-text transition-colors hover:bg-surface-2 print:hidden"
    >
      <Printer className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** Quiet attribution line so customers know who the page came from. */
export function CustomerFooter({
  businessName,
}: {
  businessName: string | null;
}) {
  return (
    <footer className="border-t border-line pt-4 text-center text-xs text-faint">
      {businessName ? `Shared by ${businessName}` : 'Shared with you'}
    </footer>
  );
}
