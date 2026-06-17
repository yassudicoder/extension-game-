import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

// Minimal MV3 build. @crxjs handles the three awkward MV3 targets for us:
//  - the service worker is emitted as a single ES module (manifest sets type:module)
//  - the content script is bundled so it can run in the page without ESM import issues
//  - index.html is the React popup entry
// We keep the config tiny on purpose; everything else lives in manifest.config.ts.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'esnext',
    // No remote code (MV3 policy): everything is bundled locally.
    rollupOptions: {},
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
})
