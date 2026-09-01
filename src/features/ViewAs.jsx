import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Eye, Search, ArrowRight, Undo2, ShieldAlert, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Avatar, Badge, Button, Skeleton, EmptyState } from '@/components/ui/primitives'
import { api } from '@/lib/api'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { ROLE_LABEL, cn } from '@/lib/utils'

/** Where each role lands when you start viewing as them. */
export const HOME_FOR = {
  client: '/portal',
  guard: '/me',
  admin: '/dashboard',
  ops_manager: '/dashboard',
  supervisor: '/dashboard',
  finance: '/invoices',
}

const GROUP_ORDER = ['client', 'guard', 'supervisor', 'finance', 'ops_manager', 'admin']
const GROUP_LABEL = {
  client: 'Client portal accounts',
  guard: 'Officer portal accounts',
  supervisor: 'Supervisors',
  finance: 'Finance',
  ops_manager: 'Operations managers',
  admin: 'Administrators',
}

export function ViewAsDialog({ open, onClose }) {
  const { impersonate } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ['impersonation-targets'],
    queryFn: () => api.impersonationTargets(),
    enabled: open,
    staleTime: 60_000,
  })

  const grouped = useMemo(() => {
    const term = q.trim().toLowerCase()
    const filtered = term
      ? targets.filter((t) =>
        [t.name, t.email, t.role, t.context].filter(Boolean).some((v) => v.toLowerCase().includes(term)))
      : targets
    const by = {}
    filtered.forEach((t) => { (by[t.role] = by[t.role] || []).push(t) })
    return GROUP_ORDER.filter((r) => by[r]?.length).map((r) => ({ role: r, items: by[r] }))
  }, [targets, q])

  const go = async (t) => {
    setBusy(t.id)
    try {
      await impersonate(t.id)
      onClose()
      navigate(HOME_FOR[t.role] || '/dashboard', { replace: true })
      toast.info(`Viewing as ${t.name}`, { body: 'Everything you see and do is scoped to this account until you return.' })
    } catch (err) {
      toast.error('Could not switch account', { body: err.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="View as another user"
      subtitle="See the platform exactly as they do, with the same permissions, data scope and navigation"
      footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}
    >
      <div className="space-y-4">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, role or account…"
            className="input pl-9"
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn/[.07] px-3 py-2.5">
          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-[11.5px] leading-relaxed text-muted">
            Anything you do while viewing as someone else is written to the audit trail against
            both accounts, theirs and yours.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : grouped.length === 0 ? (
          <EmptyState icon={Eye} title="No matching accounts" body="Try a different name, email or role." />
        ) : (
          <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
            {grouped.map((g) => (
              <section key={g.role}>
                <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.12em] text-faint">
                  {GROUP_LABEL[g.role]} <span className="text-line">·</span> {g.items.length}
                </p>
                <div className="space-y-1.5">
                  {g.items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => go(t)}
                      disabled={!!busy}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border border-line bg-surface2/40 px-3 py-2.5 text-left transition',
                        'hover:border-accent/40 hover:bg-surface2 disabled:opacity-50'
                      )}
                    >
                      <Avatar name={t.name} hue={t.avatarHue} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{t.name}</p>
                        <p className="truncate text-[11px] text-faint">{t.context || t.email}</p>
                      </div>
                      <Badge value={t.role} label={ROLE_LABEL[t.role]} size="sm" />
                      {busy === t.id
                        ? <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" />
                        : <ArrowRight size={14} className="shrink-0 text-faint" />}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

export function ImpersonationBanner() {
  const { impersonator, user, stopImpersonating } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  if (!impersonator) return null

  const back = async () => {
    setBusy(true)
    try {
      const me = await stopImpersonating()
      navigate(HOME_FOR[me.role] || '/dashboard', { replace: true })
      toast.success('Back in your own account')
    } catch (err) {
      toast.error('Could not return', { body: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-40 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-accent2/30 bg-accent2/[.12] px-3 py-2 sm:px-4">
      <span className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent2 text-white">
          <Eye size={13} />
        </span>
        <span className="text-[12.5px] font-semibold text-ink">
          Viewing as {user.name}
        </span>
      </span>
      <Badge value={user.role} label={ROLE_LABEL[user.role]} size="sm" />
      <span className="hidden text-[11.5px] text-muted sm:inline">
        You are seeing exactly what this account sees. Signed in as {impersonator.name}.
      </span>
      <Button
        size="xs"
        variant="secondary"
        icon={Undo2}
        loading={busy}
        onClick={back}
        className="ml-auto"
      >
        Return to my account
      </Button>
    </div>
  )
}

/** Small inline button used on client/officer detail pages. */
export function ViewAsButton({ userId, label = 'View as', size = 'sm', variant = 'secondary' }) {
  const { canImpersonate, impersonate } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  if (!canImpersonate || !userId) return null

  return (
    <Button
      size={size}
      variant={variant}
      icon={Eye}
      loading={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const u = await impersonate(userId)
          navigate(HOME_FOR[u.role] || '/dashboard', { replace: true })
          toast.info(`Viewing as ${u.name}`)
        } catch (err) {
          toast.error('Could not switch account', { body: err.message })
        } finally {
          setBusy(false)
        }
      }}
    >
      {label}
    </Button>
  )
}

/**
 * "Open their portal" for a client or officer record. Resolves the linked
 * login first, and stays hidden when there is no account to view as.
 */
export function ViewAsEntityButton({ clientId, guardId, label }) {
  const { canImpersonate } = useAuth()
  const { data } = useQuery({
    queryKey: ['linked-user', clientId || guardId],
    queryFn: () => api.linkedUser({ clientId, guardId }),
    enabled: !!canImpersonate && !!(clientId || guardId),
    staleTime: 60_000,
  })
  if (!data) return null
  return <ViewAsButton userId={data.id} label={label || `View as ${data.name.split(' ')[0]}`} />
}
