import type { Metadata, Viewport } from 'next';
import React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'reve8 Studio',
  description: 'Interior design client management by reve8',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e2e9fa' },
    { media: '(prefers-color-scheme: dark)', color: '#070b15' },
  ],
};

// Theme init script runs synchronously before paint to prevent flash
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline theme init — prevents dark mode flash on load */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen text-dark-900 dark:text-white"
      >
        {children}
      </body>
    </html>
  );
}
