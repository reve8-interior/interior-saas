'use client';

import { useTheme } from '@/components/providers/ThemeProvider';
import { Moon, Sun } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
  isExpanded?: boolean;
}

export default function ThemeToggle({
  className = '',
  isExpanded = false,
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div
      className={`relative flex h-9 items-center rounded-full border border-primary-300/15 bg-dark-800 transition-all duration-300 ${
        isExpanded ? 'w-full' : 'w-9'
      } ${className}`}
    >
      {/* Segmented: expanded state */}
      <div
        className={`absolute inset-0 flex transition-opacity duration-200 ${
          isExpanded ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {/* Sliding indicator */}
        <div
          className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-primary-500/30 transition-transform duration-300 ${
            isDark ? 'translate-x-[calc(100%+4px)]' : 'translate-x-1'
          }`}
        />
        <button
          onClick={() => setTheme('light')}
          className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 text-xs font-medium transition-colors duration-200 ${
            !isDark
              ? 'text-white'
              : 'text-dark-500 hover:text-dark-200 dark:text-dark-400'
          }`}
        >
          <Sun className="h-3.5 w-3.5 shrink-0" />
          <span>Light</span>
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 text-xs font-medium transition-colors duration-200 ${
            isDark
              ? 'text-white'
              : 'text-dark-500 hover:text-dark-200 dark:text-dark-400'
          }`}
        >
          <Moon className="h-3.5 w-3.5 shrink-0" />
          <span>Dark</span>
        </button>
      </div>

      {/* Icon: collapsed state */}
      <button
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className={`absolute inset-0 flex items-center justify-center text-dark-300 transition-opacity duration-200 hover:text-white ${
          isExpanded ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>
    </div>
  );
}
