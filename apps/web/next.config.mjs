/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone with only the traced server dependencies, which
  // is what apps/web/Dockerfile ships.
  output: 'standalone',
  // The app is a pure client of the API; it never needs to embed secrets.
  poweredByHeader: false,
};

export default nextConfig;
