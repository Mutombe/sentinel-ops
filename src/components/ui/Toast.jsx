import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertTriangle, XCircle, Info, X, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }
const TONES = {
  success: 'border-ok/30 text-ok',
  error: 'border-critical/40 text-critical',
  warning: 'border-warn/30 text-warn',
  info: 'border-accent/30 text-accent',
}

let seq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback(
    (opts) => {
      const id = ++seq
      const toast = { id, type: 'info', duration: 4200, ...(typeof opts === 'string' ? { title: opts } : opts) }
      setToasts((t) => [...t.slice(-4), toast])
      if (toast.duration !== 0) {
        timers.current[id] = setTimeout(() => dismiss(id), toast.duration)
      }
      return id
    },
    [dismiss]
  )

  const value = useRef(null)
  value.current = {
    push,
    dismiss,
    success: (title, o) => push({ type: 'success', title, ...o }),
    error: (title, o) => push({ type: 'error', title, duration: 7000, ...o }),
    warning: (title, o) => push({ type: 'warning', title, ...o }),
    info: (title, o) => push({ type: 'info', title, ...o }),
  }

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  return (
    <ToastCtx.Provider value={value.current}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(400px,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map((t) => {
            const Icon = ICONS[t.type]
            return (
              <div
                key={t.id}
                role="status"
                className={cn(
                  'pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface p-3 shadow-pop animate-in',
                  TONES[t.type]
                )}
              >
                <Icon size={17} className="mt-px shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-ink">{t.title}</p>
                  {t.body && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{t.body}</p>}
                  {t.action && (
                    <button
                      onClick={() => { t.action.onClick(); dismiss(t.id) }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface2 px-2 py-1 text-[11.5px] font-semibold text-ink hover:border-faint/60"
                    >
                      <Undo2 size={12} /> {t.action.label}
                    </button>
                  )}
                </div>
                <button onClick={() => dismiss(t.id)} className="shrink-0 rounded p-0.5 text-faint transition hover:text-ink">
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  )
}
