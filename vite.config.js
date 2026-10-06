import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/',
  optimizeDeps: { noDiscovery:true, include:[] },
  build: { emptyOutDir:false },
});
