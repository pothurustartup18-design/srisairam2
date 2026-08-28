import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/authContext'
import { SchoolProvider } from './context/schoolContext'
import { SocketProvider } from './context/socketContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SchoolProvider>
        <SocketProvider>
          <App />
        </SocketProvider>
      </SchoolProvider>
    </AuthProvider>
  </StrictMode>,
)
