import { mountPet } from './pet-overlay'

// Content-script entry. The pet is a non-intrusive overlay: we only ever append our
// own shadow host and never modify the host page's DOM or styles otherwise.
//
// We deliberately no-op in places where an overlay would be wrong or unwelcome:
//   - inside iframes (only the top-level document hosts the pet),
//   - on non-HTML documents (PDFs, XML, images served inline).
// On pages with a very strict CSP the script may simply not run; that's fine — the
// pet just won't appear there, and nothing breaks.
function canMount(): boolean {
  if (window.top !== window.self) return false
  const contentType = document.contentType || 'text/html'
  return contentType === 'text/html' || contentType === 'application/xhtml+xml'
}

if (canMount()) {
  void mountPet()
}
