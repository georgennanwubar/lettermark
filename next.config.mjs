/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Smaller Docker images
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  // mjml uses fs/path; keep it server-only
  serverExternalPackages: ['mjml', 'pg-boss', 'argon2', 'pg', 'nodemailer'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  productionBrowserSourceMaps: false,
};

export default nextConfig;
