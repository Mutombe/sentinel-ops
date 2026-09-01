import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './primitives'

function useLockScroll(open) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
}

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' }

export function Modal({ open, onClose, title, subtitle, size = 'md', footer, children, className }) {
  useLockScroll(open)
  useEscape(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn('relative my-auto w-full rounded-2xl border border-line bg-surface shadow-pop animate-pop', SIZES[size], className)}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-faint">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="-mr-1 shrink-0 rounded-lg p-1.5 text-faint transition hover:bg-surface2 hover:text-ink">
            <X size={17} />
          </button>
        </header>
        <div className="max-h-[calc(100vh-16rem)] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface2/50 px-5 py-3.5">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

export function Drawer({ open, onClose, title, subtitle, badge, footer, children, width = 'max-w-2xl' }) {
  useLockScroll(open)
  useEscape(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[150]">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <aside className={cn('absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-pop animate-slide', width)}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
              {badge}
            </div>
            {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-faint">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="-mr-1 shrink-0 rounded-lg p-1.5 text-faint transition hover:bg-surface2 hover:text-ink">
            <X size={17} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface2/50 px-5 py-3.5">{footer}</footer>}
      </aside>
    </div>,
    document.body
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', variant = 'danger', requireText }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setText(''); setBusy(false) } }, [open])
  const blocked = requireText && text.trim() !== requireText

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={variant}
            loading={busy}
            disabled={blocked}
            onClick={async () => {
              setBusy(true)
              try { await onConfirm() } finally { setBusy(false); onClose() }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-critical/25 bg-critical/10 text-critical">
          <AlertTriangle size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-relaxed text-muted">{body}</p>
          {requireText && (
            <div className="mt-3">
              <p className="mb-1.5 text-[12px] text-faint">
                Type <span className="mono rounded bg-surface2 px-1 py-0.5 font-semibold text-ink">{requireText}</span> to confirm
              </p>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
