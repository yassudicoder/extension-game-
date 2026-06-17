import { defineConfig } from 'vite'

// Static marketing site. base:'./' keeps asset URLs relative so it deploys cleanly
// to Vercel/Netlify AND to a GitHub Pages project sub-path with no config change.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 2048, // inline tiny assets; keep fonts/sprites as real files
  },
})
