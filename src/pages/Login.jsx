import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Mail, Lock, ArrowRight, KeyRound, AlertCircle, Eye, EyeOff, ArrowLeft, Radar, Users, Building2, Activity } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/auth/AuthContext'
import { Button, Field, Input, Avatar } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { cn, ROLE_LABEL } from '@/lib/utils'

const DEMO = [
  { email: 'admin@sentinelops.co.zw', password: 'admin123', role: 'admin', name: 'Tendai Marangwanda', blurb: 'Full access to every module' },
  { email: 'ops@sentinelops.co.zw', password: 'ops123', role: 'ops_manager', name: 'Rutendo Chikafu', blurb: 'Operations, without payroll writes' },
  { email: 'supervisor@sentinelops.co.zw', password: 'super123', role: 'supervisor', name: 'Tapiwa Mutasa', blurb: 'Roster, incidents and patrols' },
  { email: 'finance@sentinelops.co.zw', password: 'finance123', role: 'finance', name: 'Precious Nyoni', blurb: 'Invoicing and payroll only' },
  { email: 'client@zambezi.co.zw', password: 'client123', role: 'client', name: 'Client Portal', blurb: 'Scoped to one client account' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [step, setStep] = useState('credentials')
  const [values, setValues] = useState({ email: '', password: '', code: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)

  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }))
    setErrors((s) => ({ ...s, [k]: undefined }))
    setError('')
  }

  // Credentials are passed explicitly rather than read back from state, because a
  // quick-login sets state and signs in within the same tick, so the state
  // would still be stale by the time we call login().
  const finish = async (creds) => {
    const s = await login(creds)
    toast.success(`Welcome back, ${s.user.name.split(' ')[0]}`)
    navigate(s.user.role === 'client' ? '/portal' : '/dashboard', { replace: true })
  }

  const submitCredentials = async (e) => {
    e?.preventDefault()
    setBusy(true); setError(''); setErrors({})
    try {
      const pre = await api.preAuth({ email: values.email, password: values.password })
      if (pre.mfaRequired) {
        setStep('mfa')
        toast.info('Verification code sent', { body: `Use ${pre.hint} for this demo environment.` })
      } else {
        await finish({ email: values.email, password: values.password })
      }
    } catch (err) {
      setError(err.message)
      setErrors(err.fields || {})
    } finally {
      setBusy(false)
    }
  }

  const submitMfa = async (e) => {
    e?.preventDefault()
    setBusy(true); setError(''); setErrors({})
    try {
      await finish({ email: values.email, password: values.password, code: values.code })
    } catch (err) {
      setError(err.message)
      setErrors(err.fields || {})
    } finally {
      setBusy(false)
    }
  }

  const quick = async (d) => {
    setValues({ email: d.email, password: d.password, code: '000000' })
    setBusy(true); setError('')
    try {
      const pre = await api.preAuth({ email: d.email, password: d.password })
      if (pre.mfaRequired) {
        setStep('mfa')
        toast.info('This account has MFA enabled', { body: 'Code pre-filled for the demo. Press Verify.' })
      } else {
        await finish({ email: d.email, password: d.password })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      {/* ---------------------------- brand panel ---------------------------- */}
      <div className="relative hidden overflow-hidden border-r border-line bg-surface lg:block">
        <div className="grid-bg absolute inset-0 opacity-40" />
        <div className="absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-accent/10 blur-[100px]" />
        <div className="absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-accent2/10 blur-[100px]" />

        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-bg">
              <ShieldCheck size={22} strokeWidth={2.4} />
            </div>
            <div>
              <p className="text-[16px] font-bold tracking-tight text-ink">Sentinel Ops</p>
              <p className="text-[11px] font-medium uppercase tracking-[.15em] text-faint">Security Operations Suite</p>
            </div>
          </div>

          <div className="max-w-lg">
            <h1 className="text-[38px] font-bold leading-[1.1] tracking-tight text-ink">
              Every officer, site and incident in<span className="text-accent"> one operating picture.</span>
            </h1>
            <p className="mt-4 text-[14px] leading-relaxed text-muted">
              Rostering, patrol assurance, incident command, contract billing and a white-label client
              portal. Built for guarding companies that answer to their clients in real time.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3">
              {[
                { icon: Radar, k: '24/7', v: 'Live control room feed' },
                { icon: Users, k: '140', v: 'Officers under management' },
                { icon: Building2, k: '24', v: 'Contracted clients' },
                { icon: Activity, k: '99.2%', v: 'Patrol compliance' },
              ].map((s) => (
                <div key={s.v} className="rounded-xl border border-line bg-bg/40 p-3.5 backdrop-blur">
                  <s.icon size={16} className="text-accent" />
                  <p className="mono mt-2 text-[19px] font-bold leading-none text-ink">{s.k}</p>
                  <p className="mt-1 text-[11.5px] text-faint">{s.v}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11.5px] text-faint">
            ISO 27001 aligned · ZRP registered · Role-based access control · Full audit trail
          </p>
        </div>
      </div>

      {/* ------------------------------ form ------------------------------- */}
      <div className="flex items-center justify-center bg-bg px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-bg">
              <ShieldCheck size={19} strokeWidth={2.4} />
            </div>
            <p className="text-[15px] font-bold text-ink">Sentinel Ops</p>
          </div>

          {step === 'credentials' ? (
            <>
              <h2 className="text-[24px] font-bold tracking-tight text-ink">Sign in</h2>
              <p className="mt-1.5 text-[13px] text-muted">Use your operations account to continue.</p>

              {error && (
                <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-critical/30 bg-critical/10 p-3 text-critical animate-in">
                  <AlertCircle size={16} className="mt-px shrink-0" />
                  <p className="text-[12.5px] font-medium leading-relaxed">{error}</p>
                </div>
              )}

              <form onSubmit={submitCredentials} className="mt-5 space-y-4">
                <Field label="Work email" error={errors.email}>
                  <Input
                    icon={Mail}
                    type="email"
                    autoComplete="username"
                    placeholder="you@sentinelops.co.zw"
                    value={values.email}
                    onChange={set('email')}
                    error={errors.email}
                    required
                  />
                </Field>

                <Field label="Password" error={errors.password}>
                  <div className="relative">
                    <Input
                      icon={Lock}
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={values.password}
                      onChange={set('password')}
                      error={errors.password}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint transition hover:text-ink"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>

                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-line bg-surface2 accent-[rgb(var(--accent))]"
                    />
                    Keep me signed in
                  </label>
                  <button
                    type="button"
                    onClick={() => toast.info('Password reset link sent', { body: 'Check your inbox. This is a demo environment, so no email is actually sent.' })}
                    className="text-[12.5px] font-semibold text-accent hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button type="submit" variant="primary" size="lg" loading={busy} iconRight={ArrowRight} className="w-full">
                  Continue
                </Button>
              </form>
            </>
          ) : (
            <>
              <button onClick={() => { setStep('credentials'); setError('') }} className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted transition hover:text-ink">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                <KeyRound size={20} />
              </div>
              <h2 className="mt-4 text-[24px] font-bold tracking-tight text-ink">Two-factor verification</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Enter the 6-digit code from your authenticator app for <span className="font-semibold text-ink">{values.email}</span>.
              </p>

              {error && (
                <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-critical/30 bg-critical/10 p-3 text-critical animate-in">
                  <AlertCircle size={16} className="mt-px shrink-0" />
                  <p className="text-[12.5px] font-medium">{error}</p>
                </div>
              )}

              <form onSubmit={submitMfa} className="mt-5 space-y-4">
                <Field label="Verification code" error={errors.code} hint="Demo code: 000000">
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={values.code}
                    onChange={set('code')}
                    error={errors.code}
                    className="mono h-12 text-center text-[22px] font-bold tracking-[.5em]"
                    autoFocus
                  />
                </Field>
                <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
                  Verify & sign in
                </Button>
              </form>
            </>
          )}

          {/* -------------------------- demo accounts ------------------------- */}
          <div className="mt-8">
            <div className="mb-2.5 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[10.5px] font-bold uppercase tracking-[.13em] text-faint">Demo accounts</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="space-y-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={() => quick(d)}
                  disabled={busy}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition',
                    'hover:border-accent/40 hover:bg-surface2 disabled:opacity-50'
                  )}
                >
                  <Avatar name={d.name} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">{ROLE_LABEL[d.role]}</span>
                    <span className="block truncate text-[11px] text-faint">{d.blurb}</span>
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-faint" />
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
              All data is generated locally in your browser. Nothing leaves this device.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
