import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import App from './App'

// Dev-only A2UI preview mode: launch with ?a2ui-dev=1 in the URL OR
// set localStorage.a2ui-dev='1' (reload to take effect) to render the
// example surfaces from v2/src/a2ui/examples/ instead of the chat UI.
// Lazy-loaded so the preview code and its imports never touch the
// production bundle unless activated.
const A2UIDevPreview = lazy(() => import('./a2ui/renderer/A2UIDevPreview'))

const isA2UIDev =
  new URLSearchParams(window.location.search).has('a2ui-dev') ||
  localStorage.getItem('a2ui-dev') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isA2UIDev ? (
      <Suspense fallback={null}>
        <A2UIDevPreview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
)
