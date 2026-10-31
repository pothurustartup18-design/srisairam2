import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/authContext'
import { SchoolProvider } from './context/schoolContext'
import { SocketProvider } from './context/socketContext'
import ErrorBoundary from './components/shared/ErrorBoundary/ErrorBoundary'
import AppUpdateBanner from './components/shared/AppUpdates/AppUpdateBanner'
import { initAppUpdates } from './services/appUpdates/appUpdates'

// Confirm this web bundle started correctly before anything else (otherwise the
// live-update plugin rolls back to the previous bundle) and reconcile any
// update that was pending before this launch. No-op in the browser.
void initAppUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <SchoolProvider>
          <SocketProvider>
            <App />
          </SocketProvider>
        </SchoolProvider>
      </AuthProvider>
      <AppUpdateBanner />
    </ErrorBoundary>
  </StrictMode>,
)
