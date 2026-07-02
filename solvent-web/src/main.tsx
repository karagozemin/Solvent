import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import './index.css'
import App from './App.tsx'

// Stellar SDK uses Buffer; polyfill it for the browser.
;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
