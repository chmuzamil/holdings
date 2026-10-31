import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import './index.css'
import './App.css'
import './polish.css'
import App from './App.jsx'
import { ServerGate } from './components/server/ServerGate'
import { handlePreloadError } from './lib/reload-on-update'

// A tab opened before an update reloads once instead of going blank.
window.addEventListener('vite:preloadError', (event) => handlePreloadError(event))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* The demo never talks to a server. */}
    <ServerGate skip={import.meta.env.VITE_DEMO === 'true'}>
      {(server) => <App server={server} />}
    </ServerGate>
  </StrictMode>,
)
