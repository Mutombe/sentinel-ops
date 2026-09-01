import React, { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Bell, Menu, X, LogOut, ChevronDown, Sun, Moon, ShieldCheck,
  Command as CmdIcon, CircleDot, Zap, RefreshCw, User as UserIcon, ChevronRight, Eye,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { api } from '@/lib/api'
import { store } from '@/lib/db'
import { navForRole } from './nav'
import { cn, ROLE_LABEL, timeAgo, titleCase } from '@/lib/utils'
import { Avatar, Button, Badge } from '@/components/ui/primitives'
import { useDashboard, useHotkey, useDebounced } from '@/lib/hooks'
import { ImpersonationBanner, ViewAsDialog } from '@/features/ViewAs'
import { useToast } from '@/components/ui/Toast'

/* ============================== Sidebar ============================== */
function Sidebar({ open, onClose }) {
  const { user, can } = useAuth()
  const nav = useMemo(() => navForRole(user.role), [user.role])
  const { data: dash } = useDashboard()
  const settings = store.getSettings()

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-line bg-surface transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-bg">
            <ShieldCheck size={18} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-bold leading-tight tracking-tight text-ink">{settings.orgName}</p>
            <p className="truncate text-[10.5px] font-medium uppercase tracking-[.1em] text-faint">
              {user.role === 'client' ? 'Client Portal' : user.role === 'guard' ? 'Officer Portal' : 'Operations Suite'}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-faint hover:text-ink lg:hidden">
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-4">
          {nav.map((group) => {
            const items = group.items.filter((i) => !i.resource || i.resource === 'reports' || can(i.resource, 'read'))
            if (!items.length) return null
            return (
              <div key={group.section}>
                <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[.13em] text-faint/70">{group.section}</p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const count = item.badge && dash?.kpis ? dash.kpis[item.badge] : 0
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={onClose}
                        className={({ isActive }) => cn('navlink', isActive && 'navlink-active')}
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute inset-y-1.5 -left-[10px] w-[3px] rounded-r bg-accent" />}
                            <item.icon size={16} className={cn('shrink-0', isActive ? 'text-accent' : 'text-faint')} />
                            <span className="flex-1 truncate">{item.label}</span>
                            {count > 0 && (
                              <span className="mono rounded-full bg-critical/15 px-1.5 text-[10px] font-bold text-critical">{count}</span>
                            )}
                          </>
                        )}
                      </NavLink>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        <SystemStatus />
      </aside>
    </>
  )
}

function SystemStatus() {
  const settings = store.getSettings()
  return (
    <div className="shrink-0 border-t border-line px-3 py-3">
      <div className="rounded-lg border border-line bg-surface2/60 p-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
          </span>
          <span className="text-[11.5px] font-semibold text-ink">All systems operational</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10.5px] text-faint">
          <div className="flex items-center gap-1"><CircleDot size={9} className="text-ok" /> API {settings.latency}ms</div>
          <div className="flex items-center gap-1">
            <Zap size={9} className={settings.chaos ? 'text-warn' : 'text-faint'} /> Chaos {settings.chaos}%
          </div>
        </div>
      </div>
    </div>
  )
}

/* =========================== Command palette ========================= */
function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 220)
  const navigate = useNavigate()
  const { user, can } = useAuth()
  const [cursor, setCursor] = useState(0)

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', dq],
    queryFn: () => api.globalSearch(dq),
    enabled: open && dq.trim().length >= 2,
  })

  const pages = useMemo(() => {
    const flat = navForRole(user.role).flatMap((g) => g.items.map((i) => ({ ...i, section: g.section })))
    return flat
      .filter((i) => !i.resource || i.resource === 'reports' || can(i.resource, 'read'))
      .filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 6)
  }, [q, user.role, can])

  const items = useMemo(
    () => [
      ...pages.map((p) => ({ kind: 'page', title: p.label, subtitle: p.section, to: p.to, icon: p.icon })),
      ...results.map((r) => ({ kind: 'record', title: r.title, subtitle: `${r.type} · ${r.subtitle}`, to: r.to })),
    ],
    [pages, results]
  )

  useEffect(() => { setCursor(0) }, [q, results])
  useEffect(() => { if (open) setQ('') }, [open])

  if (!open) return null

  const go = (item) => { if (item) { navigate(item.to); onClose() } }

  return (
    <div className="fixed inset-0 z-[160] flex items-start justify-center p-4 pt-[12vh]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-pop">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
              if (e.key === 'Enter') { e.preventDefault(); go(items[cursor]) }
            }}
            placeholder="Search officers, sites, incidents, invoices…"
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
          />
          {isFetching && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />}
          <kbd className="kbd">ESC</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-faint">
              {dq.length >= 2 ? 'No matches found.' : 'Type at least 2 characters to search records.'}
            </p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.kind + item.to + i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(item)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                  i === cursor ? 'bg-surface2' : 'hover:bg-surface2/60'
                )}
              >
                {item.icon ? (
                  <item.icon size={15} className="shrink-0 text-faint" />
                ) : (
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-accent/12 text-[9px] font-bold text-accent">
                    {item.subtitle.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{item.title}</span>
                  <span className="block truncate text-[11.5px] text-faint">{item.subtitle}</span>
                </span>
                <ChevronRight size={13} className="shrink-0 text-faint" />
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line bg-surface2/50 px-4 py-2 text-[11px] text-faint">
          <span className="flex items-center gap-1"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="kbd">↵</kbd> open</span>
        </div>
      </div>
    </div>
  )
}

/* ============================ Notifications ========================== */
function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['notifications', 'list', {}],
    queryFn: () => api.list('notifications', { pageSize: 20 }),
    refetchInterval: 45_000,
  })
  const rows = data?.rows || []
  const unread = rows.filter((n) => !n.read).length

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const tone = { critical: 'text-critical bg-critical/10', warning: 'text-warn bg-warn/10', info: 'text-accent bg-accent/10' }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost btn-icon relative" aria-label="Notifications">
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-critical px-1 text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[340px] overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-pop">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <p className="text-[13px] font-semibold text-ink">Notifications</p>
            <button
              className="text-[11.5px] font-semibold text-accent hover:underline"
              onClick={async () => { await api.markAllNotifications(); qc.invalidateQueries({ queryKey: ['notifications'] }) }}
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {rows.length === 0 && <p className="px-4 py-8 text-center text-[12.5px] text-faint">You're all caught up.</p>}
            {rows.map((n) => (
              <button
                key={n.id}
                onClick={async () => {
                  await api.markNotification(n.id, true)
                  qc.invalidateQueries({ queryKey: ['notifications'] })
                  setOpen(false)
                  if (n.link) navigate(n.link)
                }}
                className={cn('flex w-full gap-3 border-b border-line/60 px-3.5 py-3 text-left transition hover:bg-surface2', !n.read && 'bg-accent/[.04]')}
              >
                <span className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-bold', tone[n.type])}>
                  {n.type[0].toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-1.5">
                    <span className="flex-1 text-[12.5px] font-semibold leading-snug text-ink">{n.title}</span>
                    {!n.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{n.body}</span>
                  <span className="mt-1 block text-[10.5px] text-faint">{timeAgo(n.at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================== User menu ============================ */
function UserMenu({ onViewAs }) {
  const { user, logout, canImpersonate, isImpersonating } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-surface2">
        <Avatar name={user.name} hue={user.avatarHue} size={28} />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[130px] truncate text-[12.5px] font-semibold leading-tight text-ink">{user.name}</span>
          <span className="block text-[10.5px] leading-tight text-faint">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown size={14} className="text-faint" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-pop">
          <div className="border-b border-line px-3.5 py-3">
            <p className="truncate text-[13px] font-semibold text-ink">{user.name}</p>
            <p className="truncate text-[11.5px] text-faint">{user.email}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Badge value={user.role} label={ROLE_LABEL[user.role]} size="sm" />
              {user.mfa && <Badge value="active" label="MFA on" size="sm" />}
            </div>
          </div>
          <div className="p-1.5">
            <button onClick={() => { setOpen(false); navigate('/settings') }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted transition hover:bg-surface2 hover:text-ink">
              <UserIcon size={15} /> Profile & settings
            </button>
            {canImpersonate && !isImpersonating && (
              <button onClick={() => { setOpen(false); onViewAs() }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted transition hover:bg-surface2 hover:text-ink">
                <Eye size={15} /> View as another user
                <span className="ml-auto flex gap-0.5"><kbd className="kbd">⇧</kbd><kbd className="kbd">V</kbd></span>
              </button>
            )}
            <button onClick={() => { setOpen(false); logout() }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-critical transition hover:bg-critical/10">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================== Topbar =============================== */
function Topbar({ onMenu, onPalette, onViewAs }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const qc = useQueryClient()
  const toast = useToast()
  const loc = useLocation()

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    store.setSettings({ theme: next })
    setTheme(next)
  }

  const crumbs = loc.pathname.split('/').filter(Boolean)

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-md sm:px-4">
      <button onClick={onMenu} className="btn btn-ghost btn-icon lg:hidden"><Menu size={18} /></button>

      <nav className="hidden min-w-0 items-center gap-1.5 text-[12.5px] lg:flex">
        {crumbs.map((c, i) => (
          <React.Fragment key={c + i}>
            {i > 0 && <ChevronRight size={12} className="text-faint" />}
            <span className={cn('truncate', i === crumbs.length - 1 ? 'font-semibold text-ink' : 'text-faint')}>
              {c.startsWith('cl_') || c.startsWith('st_') || c.startsWith('gd_') || c.startsWith('in_') ? c : titleCase(c)}
            </span>
          </React.Fragment>
        ))}
      </nav>

      <button
        onClick={onPalette}
        className="ml-auto flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-[13px] text-faint transition hover:border-faint/50 sm:max-w-xs"
      >
        <Search size={14} />
        <span className="flex-1 truncate">Search…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <kbd className="kbd"><CmdIcon size={9} /></kbd><kbd className="kbd">K</kbd>
        </span>
      </button>

      <button
        onClick={() => { qc.invalidateQueries(); toast.info('Refreshing data…') }}
        className="btn btn-ghost btn-icon"
        aria-label="Refresh"
      >
        <RefreshCw size={16} />
      </button>
      <button onClick={toggleTheme} className="btn btn-ghost btn-icon" aria-label="Toggle theme">
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <NotificationBell />
      <div className="mx-1 h-6 w-px bg-line" />
      <UserMenu onViewAs={onViewAs} />
    </header>
  )
}

/* ============================== AppShell ============================= */
export default function AppShell() {
  const [sidebar, setSidebar] = useState(false)
  const [palette, setPalette] = useState(false)
  const [viewAs, setViewAs] = useState(false)
  const { canImpersonate } = useAuth()
  const loc = useLocation()

  useHotkey('mod+k', () => setPalette((p) => !p))
  useHotkey('shift+v', () => { if (canImpersonate) setViewAs(true) })
  useHotkey('escape', () => { setPalette(false); setSidebar(false); setViewAs(false) })
  useEffect(() => { setSidebar(false) }, [loc.pathname])

  return (
    <div className="flex h-full">
      <Sidebar open={sidebar} onClose={() => setSidebar(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ImpersonationBanner />
        <Topbar onMenu={() => setSidebar(true)} onPalette={() => setPalette(true)} onViewAs={() => setViewAs(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <ViewAsDialog open={viewAs} onClose={() => setViewAs(false)} />
    </div>
  )
}

/* ============================ Page header ============================ */
export function PageHeader({ title, subtitle, actions, tabs, children }) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
      {tabs}
    </div>
  )
}
