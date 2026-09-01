import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, setActor, can } from '@/lib/api'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const qc = useQueryClient()
  const [session, setSession] = useState(() => api.restoreSession())
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    const s = api.restoreSession()
    setSession(s)
    if (s) setActor(s.user)
    const t = setTimeout(() => setBooting(false), 350)
    return () => clearTimeout(t)
  }, [])

  const login = useCallback(async (creds) => {
    const s = await api.login(creds)
    setSession(s)
    qc.clear()
    return s
  }, [qc])

  const logout = useCallback(async () => {
    await api.logout()
    setSession(null)
    qc.clear()
  }, [qc])

  const refreshUser = useCallback((user) => {
    setSession((s) => (s ? { ...s, user } : s))
  }, [])

  /* --------------------------- view-as --------------------------- *
   * Swaps the acting user at the API boundary, so permissions, row
   * scoping and navigation all follow the target account exactly as
   * that person would experience it. The operator is remembered so we
   * can hand the session back.
   * --------------------------------------------------------------- */
  const impersonate = useCallback(async (userId) => {
    const { user, impersonator } = await api.impersonate(userId)
    setSession((s) => ({ ...(s || {}), user, impersonator }))
    qc.clear()
    return user
  }, [qc])

  const stopImpersonating = useCallback(async () => {
    const { user } = await api.stopImpersonating()
    setSession((s) => {
      const next = { ...(s || {}), user }
      delete next.impersonator
      return next
    })
    qc.clear()
    return user
  }, [qc])

  const value = useMemo(() => {
    const user = session?.user || null
    const impersonator = session?.impersonator || null
    // Permission questions are answered for the account being viewed, so the
    // UI matches what that person can actually do.
    return {
      session,
      user,
      impersonator,
      isImpersonating: !!impersonator,
      booting,
      login,
      logout,
      refreshUser,
      impersonate,
      stopImpersonating,
      isClient: user?.role === 'client',
      isGuard: user?.role === 'guard',
      isStaff: !!user && !['client', 'guard'].includes(user.role),
      /** Can the *operator* (real signed-in person) use view-as? */
      canImpersonate: can(impersonator || user, 'users', 'update'),
      can: (resource, action = 'read') => can(user, resource, action),
    }
  }, [session, booting, login, logout, refreshUser, impersonate, stopImpersonating])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
