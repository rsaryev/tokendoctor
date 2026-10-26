import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { App } from './App'

const root = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// The build prerenders the page into #root (scripts/prerender.mjs), so React adopts the markup
// already painted; the dev server serves an empty #root.
if (root.hasChildNodes()) hydrateRoot(root, app)
else createRoot(root).render(app)
