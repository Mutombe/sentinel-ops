import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  User, Lock, Palette, Database, Zap, Building, Bell, ShieldCheck, RotateCcw,
  Save, Download, AlertTriangle, Gauge, Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, Button, Field, Input, Select, Switch, Avatar, Badge, Tabs, Segmented, Progress } from '@/components/ui/primitives'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useForm } from '@/lib/hooks'
import { api } from '@/lib/api'
import { store, DEFAULT_SETTINGS } from '@/lib/db'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { ROLE_LABEL, fmtDateTime, num, download, cn } from '@/lib/utils'

export default function Settings() {
  const { user, refreshUser, logout, can } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState('profile')
  const [settings, setSettings] = useState(store.getSettings())
  const [resetOpen, setResetOpen] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [usage, setUsage] = useState(null)

  React.useEffect(() => {
    let live = true
    store.usage().then((u) => { if (live) setUsage(u) })
    return () => { live = false }
  }, [])

  const profile = useForm({ name: user.name, email: user.email, title: user.title || '', mfa: !!user.mfa })
  const pw = useForm({ current: '', next: '', confirm: '' })

  const patchSettings = (patch) => {
    const next = store.setSettings(patch)
    setSettings({ ...next })
    if (patch.theme) document.documentElement.dataset.theme = patch.theme
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const updated = await api.updateProfile(profile.values)
      refreshUser(updated)
      toast.success('Profile updated')
    } catch (err) {
      profile.applyServerError(err)
      toast.error('Could not update profile', { body: err.message })
    } finally {
      setSavingProfile(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    if (pw.values.next !== pw.values.confirm) {
      pw.setErrors({ confirm: 'Passwords do not match' })
      return
    }
    setSavingPw(true)
    try {
      await api.changePassword({ current: pw.values.current, next: pw.values.next })
      pw.reset({ current: '', next: '', confirm: '' })
      toast.success('Password changed', { body: 'Use your new password the next time you sign in.' })
    } catch (err) {
      pw.applyServerError(err)
      toast.error('Could not change password', { body: err.message })
    } finally {
      setSavingPw(false)
    }
  }

  const stats = store.stats()

  const tabs = [
    { value: 'profile', label: 'Profile' },
    { value: 'security', label: 'Security' },
    { value: 'appearance', label: 'Appearance' },
    ...(can('users', 'read') ? [{ value: 'organisation', label: 'Organisation' }] : []),
    { value: 'simulation', label: 'Simulation' },
    { value: 'data', label: 'Data' },
  ]

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your account, workspace preferences and platform behaviour."
        tabs={<Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-4" />}
      />

      {tab === 'profile' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Your profile" subtitle="How you appear across the platform">
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="flex items-center gap-4 rounded-lg border border-line bg-surface2/40 p-4">
                <Avatar name={profile.values.name} hue={user.avatarHue} size={56} />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink">{profile.values.name}</p>
                  <p className="truncate text-[12px] text-faint">{user.email}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <Badge value={user.role} label={ROLE_LABEL[user.role]} size="sm" />
                    {user.mfa && <Badge value="active" label="MFA on" size="sm" />}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" error={profile.errors.name}><Input {...profile.bind('name')} /></Field>
                <Field label="Email" error={profile.errors.email}><Input type="email" {...profile.bind('email')} /></Field>
                <Field label="Job title" className="sm:col-span-2"><Input {...profile.bind('title')} /></Field>
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="primary" icon={Save} loading={savingProfile} disabled={!profile.dirty}>Save changes</Button>
              </div>
            </form>
          </Card>

          <Card title="Session">
            <div className="space-y-2.5 text-[12.5px]">
              {[
                ['Role', ROLE_LABEL[user.role]],
                ['Account ID', user.id],
                ['Created', fmtDateTime(user.createdAt)],
                ['Last sign-in', fmtDateTime(user.lastLogin)],
                ['Two-factor', user.mfa ? 'Enabled' : 'Disabled'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                  <span className="text-muted">{k}</span>
                  <span className="mono truncate text-right text-ink">{v}</span>
                </div>
              ))}
            </div>
            <Button className="mt-4 w-full" variant="secondary" onClick={logout}>Sign out of this device</Button>
          </Card>
        </div>
      )}

      {tab === 'security' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Change password" subtitle="Choose something you don't use anywhere else">
            <form onSubmit={savePassword} className="space-y-4">
              <Field label="Current password" error={pw.errors.current}>
                <Input type="password" autoComplete="current-password" {...pw.bind('current')} />
              </Field>
              <Field label="New password" error={pw.errors.next} hint="Minimum 6 characters">
                <Input type="password" autoComplete="new-password" {...pw.bind('next')} />
              </Field>
              <Field label="Confirm new password" error={pw.errors.confirm}>
                <Input type="password" autoComplete="new-password" {...pw.bind('confirm')} />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" variant="primary" icon={Lock} loading={savingPw} disabled={!pw.values.current || !pw.values.next}>
                  Update password
                </Button>
              </div>
            </form>
          </Card>

          <Card title="Authentication" subtitle="Second factor and session policy">
            <div className="space-y-4">
              <div className="rounded-lg border border-line bg-surface2/40 p-3.5">
                <Switch
                  checked={profile.values.mfa}
                  onChange={async (v) => {
                    profile.set('mfa', v)
                    try {
                      const u = await api.updateProfile({ mfa: v })
                      refreshUser(u)
                      toast.success(v ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled')
                    } catch (err) {
                      profile.set('mfa', !v)
                      toast.error('Could not update', { body: err.message })
                    }
                  }}
                  label="Require a 6-digit code at sign-in"
                  hint="Demo environment accepts 000000 as the verification code."
                />
              </div>

              <div className="rounded-lg border border-accent/20 bg-accent/[.06] p-3.5">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" />
                  <div>
                    <p className="text-[12.5px] font-semibold text-ink">Session security</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                      Sessions expire after 8 hours of issue. All privileged actions are written to the
                      audit trail with your account, IP and client.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-[12.5px]">
                {[
                  ['Password policy', 'Minimum 6 characters'],
                  ['Session lifetime', '8 hours'],
                  ['Failed sign-in logging', 'Enabled'],
                  ['Audit retention', '7 years'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                    <span className="text-muted">{k}</span>
                    <span className="text-right text-ink">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'appearance' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Theme" subtitle="Applies to this browser only">
            <div className="space-y-4">
              <Field label="Colour mode">
                <Segmented
                  value={settings.theme}
                  onChange={(v) => patchSettings({ theme: v })}
                  options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
                />
              </Field>
              <Field label="Rows per page" hint="Default page size for every table">
                <Segmented
                  value={String(settings.pageSize)}
                  onChange={(v) => { patchSettings({ pageSize: +v }); qc.invalidateQueries() }}
                  options={['10', '25', '50'].map((n) => ({ value: n, label: n }))}
                />
              </Field>
              <Field label="Currency" hint="Used for invoicing and payroll display">
                <Select value={settings.currency} onChange={(e) => patchSettings({ currency: e.target.value })}>
                  {['USD', 'ZAR', 'ZWG', 'GBP', 'EUR'].map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
            </div>
          </Card>

          <Card title="Notifications" subtitle="How the platform reaches you">
            <div className="space-y-4">
              <Switch
                checked={settings.emailAlerts}
                onChange={(v) => patchSettings({ emailAlerts: v })}
                label="Email alerts"
                hint="Critical incidents, SLA breaches and overdue invoices."
              />
              <Switch
                checked={settings.smsAlerts}
                onChange={(v) => patchSettings({ smsAlerts: v })}
                label="SMS alerts"
                hint="Only for critical incidents and armed-response callouts."
              />
              <Switch
                checked={settings.autoAssignIncidents}
                onChange={(v) => patchSettings({ autoAssignIncidents: v })}
                label="Auto-assign incidents"
                hint="Route new incidents to the on-duty supervisor for that site."
              />
            </div>
          </Card>
        </div>
      )}

      {tab === 'organisation' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Organisation" subtitle="Branding shown across the workspace and client portal">
            <div className="space-y-4">
              <Field label="Company name">
                <Input value={settings.orgName} onChange={(e) => patchSettings({ orgName: e.target.value })} />
              </Field>
              <Field label="Default SLA target (minutes)" hint="Incidents reported later than this are flagged as a breach.">
                <Input type="number" min="5" step="5" value={settings.slaTargetMins} onChange={(e) => patchSettings({ slaTargetMins: +e.target.value })} />
              </Field>
              <div className="rounded-lg border border-line bg-surface2/40 p-3.5">
                <p className="text-[12.5px] font-semibold text-ink">Compliance posture</p>
                <div className="mt-2.5 space-y-2.5">
                  {[
                    ['ZRP registration', 100],
                    ['ISO 27001 controls', 87],
                    ['Officer licence validity', 92],
                    ['Insurance cover', 100],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="mb-1 flex justify-between text-[11.5px]">
                        <span className="text-muted">{k}</span>
                        <span className="mono font-semibold text-ink">{v}%</span>
                      </div>
                      <Progress value={v} tone={v >= 95 ? 'ok' : v >= 80 ? 'warn' : 'critical'} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Workspace summary">
            <div className="grid grid-cols-2 gap-2.5">
              {Object.entries(stats.counts).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-surface2/40 px-3 py-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{k}</p>
                  <p className="mono mt-0.5 text-[17px] font-bold leading-none text-ink">{num(v)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'simulation' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Network simulation" subtitle="Tune how the mock API behaves so you can feel the UI under load">
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="label mb-0">API latency</span>
                  <span className="mono text-[12.5px] font-semibold text-ink">{settings.latency} ms</span>
                </div>
                <input
                  type="range" min="0" max="2500" step="50"
                  value={settings.latency}
                  onChange={(e) => patchSettings({ latency: +e.target.value })}
                  className="w-full accent-[rgb(var(--accent))]"
                />
                <p className="mt-1.5 text-[11.5px] text-faint">
                  Every request waits this long (± jitter). Raise it to watch skeleton states, keep-previous-data
                  pagination and optimistic writes do their job.
                </p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="label mb-0">Write failure rate</span>
                  <span className={cn('mono text-[12.5px] font-semibold', settings.chaos ? 'text-critical' : 'text-ink')}>
                    {settings.chaos}%
                  </span>
                </div>
                <input
                  type="range" min="0" max="100" step="5"
                  value={settings.chaos}
                  onChange={(e) => patchSettings({ chaos: +e.target.value })}
                  className="w-full accent-[rgb(var(--critical))]"
                />
                <p className="mt-1.5 text-[11.5px] text-faint">
                  Randomly fails this share of create, update and delete calls with a 503. The UI rolls the
                  optimistic change back and tells you why. That path is worth seeing.
                </p>
              </div>

              {settings.chaos > 0 && (
                <div className="flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn/[.08] p-3">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    Chaos mode is on. Roughly {settings.chaos} out of every 100 writes will be rejected.
                    Turn it back to 0 for a clean run.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="secondary" icon={Gauge} onClick={() => patchSettings({ latency: 80, chaos: 0 })}>Fast & reliable</Button>
                <Button variant="secondary" icon={Zap} onClick={() => patchSettings({ latency: 1400, chaos: 25 })}>Poor network</Button>
                <Button variant="ghost" icon={RotateCcw} onClick={() => patchSettings({ latency: DEFAULT_SETTINGS.latency, chaos: 0 })}>Reset</Button>
              </div>
            </div>
          </Card>

          <Card title="What this demonstrates">
            <ul className="space-y-3">
              {[
                ['Optimistic updates', 'Creates, edits, bulk actions and deletes apply to the cache instantly, then reconcile with the server response.'],
                ['Rollback on failure', 'A failed write restores the exact pre-mutation snapshot of every cached page and surfaces the server error.'],
                ['Keep-previous-data pagination', 'Changing page or sort keeps the old rows visible with a progress bar instead of flashing empty.'],
                ['Server-side everything', 'Search, filtering, sorting, faceted counts and pagination are all computed in the API layer, not in the table.'],
                ['Scoped reads', 'Client-portal and officer accounts get a filtered dataset at the API boundary, not hidden in the UI.'],
              ].map(([t2, d]) => (
                <li key={t2} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <div>
                    <p className="text-[12.5px] font-semibold text-ink">{t2}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'data' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Local dataset" subtitle="Everything lives in your browser's IndexedDB">
            <div className="space-y-2.5 text-[12.5px]">
              <div className="flex justify-between gap-3 border-b border-line/50 pb-2">
                <span className="text-muted">Seeded</span>
                <span className="mono text-ink">{fmtDateTime(stats.seededAt)}</span>
              </div>
              <div className="flex justify-between gap-3 border-b border-line/50 pb-2">
                <span className="text-muted">Storage backend</span>
                <span className="mono text-ink">{stats.persistent ? 'IndexedDB' : 'In-memory only'}</span>
              </div>
              <div className="flex justify-between gap-3 border-b border-line/50 pb-2">
                <span className="text-muted">Origin storage used</span>
                <span className="mono text-ink">
                  {usage && usage.usage != null
                    ? `${(usage.usage / 1048576).toFixed(1)} MB of ${(usage.quota / 1048576 / 1024).toFixed(1)} GB`
                    : ''}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Total records</span>
                <span className="mono text-ink">{num(Object.values(stats.counts).reduce((a, b) => a + b, 0))}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={Download}
                onClick={() => {
                  download('sentinelops-dataset.json', JSON.stringify(store.raw(), null, 2), 'application/json')
                  toast.success('Dataset exported')
                }}
              >
                Export JSON
              </Button>
              <Button variant="danger" icon={RotateCcw} onClick={() => setResetOpen(true)}>Reset demo data</Button>
            </div>
          </Card>

          <Card title="Record counts">
            <div className="grid grid-cols-2 gap-2.5">
              {Object.entries(stats.counts).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-surface2/40 px-3 py-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{k}</p>
                  <p className="mono mt-0.5 text-[17px] font-bold leading-none text-ink">{num(v)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset all demo data?"
        body="Every record you have created, edited or deleted will be discarded and the original seeded dataset regenerated. You will be signed out."
        confirmLabel="Reset and sign out"
        requireText="RESET"
        onConfirm={async () => {
          store.reset()
          qc.clear()
          await logout()
          toast.success('Demo data restored')
        }}
      />
    </>
  )
}
