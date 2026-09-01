import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { ToastProvider } from './components/ui/Toast'
import { initStore, store } from './lib/db'
import './index.css'

document.documentElement.dataset.theme = store.getSettings().theme || 'dark'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 2),
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
    mutations: { retry: 0 },
  },
})

/* The dataset lives in IndexedDB (localStorage's ~5 MB cap could not hold it).
   Reading it is async, so boot the store before mounting. Every module below
   this point reads the data synchronously from memory. */
initStore()
  .then(({ persistent }) => {
    if (!persistent) {
      console.warn('[SentinelOps] IndexedDB unavailable, so the app is running in memory. Changes will not survive a reload.')
    }
    mount()
  })
  .catch((err) => {
    console.error('[SentinelOps] store failed to initialise', err)
    document.getElementById('root').innerHTML =
      '<div style="display:grid;place-items:center;height:100%;font-family:Inter,sans-serif;color:#8b97a8;text-align:center;padding:2rem">' +
      '<div><p style="color:#e2ebf4;font-weight:600;margin-bottom:.5rem">Could not open local storage</p>' +
      '<p style="font-size:13px">This demo stores its dataset in your browser. Private-browsing windows and blocked site data prevent that.</p></div></div>'
  })

function mount() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </React.StrictMode>
  )
}
