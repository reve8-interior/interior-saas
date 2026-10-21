const fs = require('fs');
const path = require('path');

function readVersion(changelogPath) {
  try {
    const content = fs.readFileSync(changelogPath, 'utf8');
    const firstLine = content.split('\n')[0].trim();
    return firstLine || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const FRONTEND_VERSION = readVersion(path.join(__dirname, 'CHANGELOG'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_FRONTEND_VERSION: FRONTEND_VERSION,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    // Import only the icons/charts/animations actually used.
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  // 'standalone' is needed for Docker; Vercel needs default (undefined).
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'via.placeholder.com' },
    ],
    unoptimized: process.env.NODE_ENV === 'development',
  },
  async rewrites() {
    const apiBaseUrl = (
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    ).replace(/\/api\/v1$/, '');

    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
