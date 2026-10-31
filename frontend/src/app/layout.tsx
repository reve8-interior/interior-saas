import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import React from 'react';
import './globals.css';

// Variable Inter, self-hosted: the in-between weights the design system uses (550) render true.
const sans = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

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
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
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
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        {/* Inline theme init — prevents dark mode flash on load */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning className="min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
