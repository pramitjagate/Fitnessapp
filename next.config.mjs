/** @type {import('next').NextConfig} */
const nextConfig = {
  // The prototype stores data in a JSON file on disk, so every route that
  // touches it must run on Node rather than the edge runtime.
  experimental: {},
  // Spotify's OAuth redirect URIs no longer accept "localhost", only the
  // loopback IP — so local dev is browsed at 127.0.0.1, and without this,
  // Next's dev-mode cross-origin check 403s its own JS bundles for any host
  // but "localhost", silently breaking hydration (clicks do nothing, no
  // visible error). See app/api/spotify/connect/route.ts.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
