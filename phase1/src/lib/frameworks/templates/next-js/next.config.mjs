/**
 * Self-hosted server build: `next build` writes .next/standalone, a folder that runs with `node server.js`.
 * Images are served as they are, so the app needs no native image library on the server, and the
 * bundle runs on any Linux server even when it was built on Windows or macOS.
 */
const config = {
  output: 'standalone',
  poweredByHeader: false,
  images: { unoptimized: true },
  outputFileTracingExcludes: { '*': ['node_modules/@img/**', 'node_modules/sharp/**'] },
};
export default config;
