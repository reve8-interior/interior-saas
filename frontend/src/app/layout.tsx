import type { Metadata, Viewport } from 'next';
import {
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Fraunces,
  Inter,
  Playfair_Display,
  Space_Grotesk,
} from 'next/font/google';
import React from 'react';
import './globals.css';

// Variable Inter, self-hosted: the in-between weights the design system uses (550) render true.
const sans = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

// Public designer website fonts (one pairing per site theme, see lib/siteThemes.ts). Not preloaded and only
// fetched by the browser when a theme actually uses them, so the rest of the app never downloads them.
// next/font needs literal options, so each font repeats subsets/display/preload.
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});
const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});
const dmSerif = DM_Serif_Display({
  variable: '--font-dm-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});

const siteFontVars = [
  fraunces,
  cormorant,
  playfair,
  spaceGrotesk,
  dmSerif,
  dmSans,
]
  .map((f) => f.variable)
  .join(' ');

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
    <html
      lang="en"
      className={`${sans.variable} ${siteFontVars}`}
      suppressHydrationWarning
    >
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
