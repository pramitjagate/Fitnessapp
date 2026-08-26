/** @type {import('next').NextConfig} */
const nextConfig = {
  // The prototype stores data in a JSON file on disk, so every route that
  // touches it must run on Node rather than the edge runtime.
  experimental: {},
};

export default nextConfig;
