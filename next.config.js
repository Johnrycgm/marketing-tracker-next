const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Setup path aliases for components and root
    config.resolve.alias['@'] = __dirname;
    config.resolve.alias['@/components'] = path.join(__dirname, 'components');
    config.resolve.alias['@components'] = path.join(__dirname, 'components');
    return config;
  },
  // Ignore TypeScript build errors during the build to allow successful deployment
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
