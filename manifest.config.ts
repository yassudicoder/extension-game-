import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

// MV3 manifest. Permissions are kept to the minimum the MVP needs.
export default defineManifest({
  manifest_version: 3,
  name: 'Pocket Pet — a gentle companion',
  version: pkg.version,
  description:
    'A tiny, always-forgiving pet that lives on your pages and gently cheers on your healthy habits.',

  action: {
    default_popup: 'index.html',
    default_title: 'Pocket Pet',
    default_icon: {
      16: 'src/assets/icons/icon-16.png',
      32: 'src/assets/icons/icon-32.png',
    },
  },

  // The service worker is ephemeral: it owns alarms + idle detection + the wellbeing
  // tick, and it is the SINGLE writer to chrome.storage.local (see service-worker.ts).
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },

  // Inject the on-page pet overlay. document_idle keeps us out of the page's
  // critical render path. The script no-ops in frames / non-HTML documents.
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],

  // storage = state, alarms = scheduling, idle = activity detection, scripting =
  // re-inject the overlay into already-open tabs after an install/update/reload
  // (declared content scripts only auto-inject on the NEXT page load).
  permissions: ['storage', 'alarms', 'idle', 'scripting'],

  // NOTE: <all_urls> lets the pet appear on every page out of the box, which matches
  // the product ("a pet that lives on your web pages"). Broad host permissions DO
  // visibly reduce install conversion, though — a later version could move to
  // activeTab + optional_host_permissions for a lighter install prompt.
  host_permissions: ['<all_urls>'],

  icons: {
    16: 'src/assets/icons/icon-16.png',
    32: 'src/assets/icons/icon-32.png',
    48: 'src/assets/icons/icon-48.png',
    128: 'src/assets/icons/icon-128.png',
  },
})
