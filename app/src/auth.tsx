import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { canAccess, friendlySignInError, landingPath, resolveRole } from '#/lib/auth'
import type { AgapayRole, DirectoryProfile } from '#/lib/auth'
import { fetchRoleInputs } from '#/lib/roleLoad'
import { getSupabase, isDemoMode } from '#/lib/supabase'

/** 'error': signed in, but the first role load failed (retry screen). */
type AuthStatus = 'loading' | 'signed-out' | 'ready' | 'error'

/** How one role load ended. 'superseded': a newer load or a sign-out
 *  replaced it, so its result was dropped. */
type RoleLoadOutcome = 'loaded' | 'failed' | 'superseded'

interface AuthState {
  status: AuthStatus
  session: Session | null
  profile: DirectoryProfile | null
  role: AgapayRole
  displayName: string
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** Re-reads the role for the current session without a loading screen.
   *  Resolves false when the read failed; the role on screen is kept. */
  refreshRole: () => Promise<boolean>
}

const DEMO_ROLE: AgapayRole = { kind: 'admin', memberId: null }

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>(isDemoMode ? 'ready' : 'loading')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<DirectoryProfile | null>(null)
  const [role, setRole] = useState<AgapayRole>(
    isDemoMode ? DEMO_ROLE : { kind: 'no-access', reason: 'no-profile' },
  )
  const [memberName, setMemberName] = useState<string>('')

  // The session the provider is following; null when signed out.
  const sessionRef = useRef<Session | null>(null)
  // The user whose role is resolved and on screen; null until a load lands.
  const resolvedUserRef = useRef<string | null>(null)
  // Bumped by every load and by sign-out: only the newest load may apply.
  const loadSeqRef = useRef(0)
  // False until the first session (or its absence) is applied on mount.
  const sessionAppliedRef = useRef(false)

  /** Resolve who this user is (see fetchRoleInputs). A failed read never
   *  downgrades access: the role on screen stays, and with no role yet the
   *  status becomes 'error' (retry screen), never a stuck 'loading'. */
  const loadRole = useCallback(
    async (activeSession: Session): Promise<RoleLoadOutcome> => {
      if (!supabase) return 'failed'
      const userId = activeSession.user.id
      loadSeqRef.current += 1
      const seq = loadSeqRef.current
      // A result applies only to the session it was asked for.
      const isCurrent = () =>
        loadSeqRef.current === seq && sessionRef.current?.user.id === userId
      try {
        const inputs = await fetchRoleInputs(supabase, userId)
        if (!isCurrent()) return 'superseded'
        setProfile(inputs.profile)
        setMemberName(inputs.memberName)
        setRole(resolveRole(inputs))
        resolvedUserRef.current = userId
        setStatus('ready')
        return 'loaded'
      } catch {
        if (!isCurrent()) return 'superseded'
        setStatus(resolvedUserRef.current === userId ? 'ready' : 'error')
        return 'failed'
      }
    },
    [supabase],
  )

  useEffect(() => {
    if (isDemoMode || !supabase) return

    let cancelled = false

    const applySession = (nextSession: Session | null) => {
      const previousUserId = sessionRef.current?.user.id ?? null
      const nextUserId = nextSession?.user.id ?? null
      // A sign-out or another account on this device: no cached row of the
      // previous user may show for the next one. (The first apply on mount
      // starts from an empty cache.)
      if (sessionAppliedRef.current && nextUserId !== previousUserId) {
        queryClient.clear()
      }
      sessionAppliedRef.current = true
      sessionRef.current = nextSession
      setSession(nextSession)
      if (nextSession) {
        // Token refreshes and tab recovery repeat the same user: the role is
        // re-read quietly, so open sheets, typed notes and filters survive.
        if (nextSession.user.id !== previousUserId) {
          // A different user: nothing of the previous role carries over.
          resolvedUserRef.current = null
          setProfile(null)
          setMemberName('')
          setRole({ kind: 'no-access', reason: 'no-profile' })
          setStatus('loading')
        }
        // Deferred: a Supabase call made inside onAuthStateChange can
        // deadlock on the client's auth lock (supabase-js guidance).
        setTimeout(() => {
          if (!cancelled) void loadRole(nextSession)
        }, 0)
      } else {
        // Drops any load still in flight for the old session.
        loadSeqRef.current += 1
        resolvedUserRef.current = null
        setProfile(null)
        setMemberName('')
        setRole({ kind: 'no-access', reason: 'no-profile' })
        setStatus('signed-out')
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      applySession(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return
      applySession(nextSession)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [supabase, loadRole, queryClient])

  const refreshRole = useCallback(async () => {
    const current = sessionRef.current
    if (!current) return false
    return (await loadRole(current)) !== 'failed'
  }, [loadRole])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: 'Supabase is not configured.' }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error ? friendlySignInError(error.message) : null }
    },
    [supabase],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return
    try {
      await supabase.auth.signOut()
    } finally {
      // Also on a failed sign-out call: this device shows nothing cached.
      queryClient.clear()
    }
  }, [supabase, queryClient])

  const value = useMemo<AuthState>(
    () => ({
      status,
      session,
      profile,
      role,
      displayName: memberName || session?.user.email || '',
      signIn,
      signOut,
      refreshRole,
    }),
    [status, session, profile, role, memberName, signIn, signOut, refreshRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

function Waiting() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-cream">
      <div className="flex flex-col items-center gap-3">
        <img
          src="/assets/logo-mark.png"
          alt=""
          className="h-8 w-8 animate-pulse rounded-full"
        />
        <span className="text-[12px] font-semibold text-ink/45">One moment…</span>
      </div>
    </div>
  )
}

/** Signed in, but the role could not be read. Retry re-runs the load. */
export function RoleLoadError() {
  const { refreshRole, signOut } = useAuth()
  const [busy, setBusy] = useState(false)

  const retry = async () => {
    if (busy) return
    setBusy(true)
    try {
      await refreshRole()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-cream px-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/assets/logo-mark.png" alt="" className="h-8 w-8 rounded-full" />
        <span role="alert" className="text-[12.5px] font-semibold text-ink/60">
          Connection failed.
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void retry()}
          className="press flex h-11 min-w-[140px] cursor-pointer items-center justify-center rounded-full bg-brand px-5 text-[13px] font-bold text-white hover:bg-brand-press disabled:cursor-not-allowed disabled:bg-ink-300"
        >
          {busy ? 'Retrying…' : 'Retry'}
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="press flex h-11 cursor-pointer items-center justify-center px-4 text-[12px] font-bold text-ink/55"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

/** Route-tree guard. In demo mode it is a no-op so the seeded prototype
 *  keeps working exactly as it does today. */
export function RequireRole({
  tree,
  children,
}: {
  tree: 'discipler' | 'admin'
  children: ReactNode
}) {
  const { status, role } = useAuth()
  if (isDemoMode) return <>{children}</>
  if (status === 'loading') return <Waiting />
  if (status === 'error') return <RoleLoadError />
  if (status === 'signed-out') return <Navigate to="/login" replace />
  if (!canAccess(role, tree)) return <Navigate to={landingPath(role)} replace />
  return <>{children}</>
}
