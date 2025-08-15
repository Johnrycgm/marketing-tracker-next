const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Add alias for root and components directory to resolve imports like '@components/ui/button'
    config.resolve.alias['@'] = __dirname;
    config.resolve.alias['@components'] = path.join(__dirname, 'components');
    return config;
  },
};

module.exports = nextConfig;
