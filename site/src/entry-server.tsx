import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { App } from './App'

/** The page as HTML, for scripts/prerender.mjs to put into dist/index.html. */
export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
