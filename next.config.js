/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Configure Next.js to use the src directory
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  // Ensure Next.js looks for pages in src/pages
  webpack(config, options) {
    return config;
  }
};

module.exports = nextConfig;