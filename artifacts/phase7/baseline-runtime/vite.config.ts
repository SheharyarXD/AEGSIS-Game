import { defineConfig } from 'vite';
export default defineConfig({
  cacheDir: 'node_modules/.vite-phase7-baseline',
  server: { watch: { usePolling: true, interval: 500, ignored: ['**/assets-source/**', '**/artifacts/**', '**/docs/**', '**/test-results/**'] } },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'], physics: ['@dimforge/rapier3d-compat'] } } } },
});
