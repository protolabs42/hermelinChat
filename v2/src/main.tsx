import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import App from './App'
import { isA2UIDevMode } from './a2ui/dev-mode'

// Dev-only A2UI preview mode: launch with ?a2ui-dev=1 in the URL.
// Keep this query-param only so the app never gets stuck reopening the
// preview from stale localStorage between normal chat sessions.
const A2UIDevPreview = lazy(() => import('./a2ui/renderer/A2UIDevPreview'))

const isA2UIDev = isA2UIDevMode(window.location.search)

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
