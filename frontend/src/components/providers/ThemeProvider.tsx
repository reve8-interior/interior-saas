'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Theme for visitors with no saved choice. */
  defaultTheme?: Theme;
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check for saved theme preference, otherwise use the default
    const savedTheme = localStorage.getItem('theme') as Theme | null;

    if (savedTheme) {
      setThemeState(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
      setThemeState(defaultTheme);
      document.documentElement.classList.toggle(
        'dark',
        defaultTheme === 'dark'
      );
      // A light default is not saved, so the dashboard keeps its own dark default.
      if (defaultTheme === 'dark') localStorage.setItem('theme', 'dark');
    }
  }, [defaultTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  // Prevent flash of wrong theme
  if (!mounted) {
    return (
      <ThemeContext.Provider
        value={{
          theme: defaultTheme,
          toggleTheme: () => {},
          setTheme: () => {},
        }}
      >
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
