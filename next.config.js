const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Add aliases for the root and components directories. This resolves imports like
    // '@/components/ui/button' and '@components/ui/button'.
    config.resolve.alias['@'] = __dirname;
    config.resolve.alias['@/components'] = path.join(__dirname, 'components');
    config.resolve.alias['@components'] = path.join(__dirname, 'components');
    return config;
  },
};

module.exports = nextConfig;
