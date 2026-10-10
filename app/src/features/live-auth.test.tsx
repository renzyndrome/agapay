// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query'
import { AuthProvider, RequireRole, useAuth } from '#/auth'
import { StoreProvider, useStore } from '#/store'
import {
  useDisciplers,
  useLifeGroups,
  useMyMemberId,
} from '#/features/directory/hooks'
import { useMeetings } from '#/features/meetings/hooks'
import { useDisciples } from '#/features/disciples/hooks'
import {
  useAddNewDisciple,
  useCreateCircle,
  useReassignDisciples,
} from '#/features/mutations'
import { AddDiscipleSheet } from '#/components/add-disciple-sheet'
import { Sheets } from '#/components/sheets'
import { Toast } from '#/components/ui'
import { addDays, toISODate, today } from '#/lib/format'

/** Live mode against an in-memory fake of the few Supabase calls these
 *  screens make. Covers the auth lifecycle (token refresh, failed role
 *  reads, sign-out races) and the live-only guards. */

interface Resp {
  data?: unknown
  count?: number | null
  error: { message: string; code?: string } | null
}
interface Query {
  table: string
  columns: string
  filters: Array<[string, unknown]>
}
type TableHandler = (q: Query) => Resp | Promise<Resp>
type AuthListener = (event: string, session: unknown) => void

const fake = vi.hoisted(() => {
  const state = {
    session: null as unknown,
    listener: null as AuthListener | null,
    tables: {} as Record<string, TableHandler | undefined>,
    rpc: {} as Record<
      string,
      ((args: unknown) => Resp | Promise<Resp>) | undefined
    >,
    rpcCalls: [] as Array<{ fn: string; args: unknown }>,
    inserts: [] as Array<{ table: string; payload: unknown }>,
    /** table reads and writes started, counted at the call */
    fromCalls: 0,
  }

  function query(table: string) {
    state.fromCalls += 1
    const q: Query = { table, columns: '', filters: [] }
    const run = (): Promise<Resp> =>
      Promise.resolve().then(() => {
        const handler = state.tables[table]
        return handler ? handler(q) : { data: [], error: null }
      })
    const builder = {
      select(columns: string) {
        q.columns = columns
        return builder
      },
      eq(column: string, value: unknown) {
        q.filters.push([column, value])
        return builder
      },
      is: () => builder,
      order: () => builder,
      insert(payload: unknown) {
        state.inserts.push({ table, payload })
        return builder
      },
      maybeSingle: run,
      then<TResult, TFailure>(
        onFulfilled: (value: Resp) => TResult | PromiseLike<TResult>,
        onRejected?: (reason: unknown) => TFailure | PromiseLike<TFailure>,
      ) {
        return run().then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  const client = {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: state.session }, error: null }),
      onAuthStateChange: (cb: AuthListener) => {
        state.listener = cb
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                state.listener = null
              },
            },
          },
        }
      },
      signOut: () => Promise.resolve({ error: null }),
      signInWithPassword: () => Promise.resolve({ error: null }),
    },
    from: query,
    schema: () => ({
      from: query,
      rpc: (fn: string, args: unknown) => {
        state.rpcCalls.push({ fn, args })
        const handler = state.rpc[fn]
        return Promise.resolve().then(() =>
          handler ? handler(args) : { data: null, error: null },
        )
      },
    }),
  }
  return { state, client }
})

vi.mock('#/lib/supabase', () => ({
  isDemoMode: false,
  hasSupabaseEnv: true,
  getSupabase: () => fake.client,
}))

const OFFLINE = { message: 'Failed to fetch' }

function sessionFor(userId: string, token = 't1') {
  return {
    access_token: token,
    user: { id: userId, email: `${userId}@example.org` },
  }
}

interface Directory {
  profile: Record<string, unknown> | null
  discipleCount: number
  memberName?: string
}

/** Serves user_profiles and members from `dir`; `fail` makes every read
 *  fail; `gate` holds reads until released. Counts profile reads. */
function serveDirectory(dir: Directory) {
  const control = {
    fail: false,
    profileReads: 0,
    memberReads: 0,
    gate: null as Promise<void> | null,
  }
  fake.state.tables.user_profiles = async () => {
    control.profileReads += 1
    if (control.gate) await control.gate
    if (control.fail) return { data: null, error: OFFLINE }
    return { data: dir.profile, error: null }
  }
  fake.state.tables.members = async (q) => {
    control.memberReads += 1
    if (control.fail) return { data: null, count: null, error: OFFLINE }
    if (q.columns === 'name') {
      return { data: { name: dir.memberName ?? 'Test Member' }, error: null }
    }
    if (q.columns === 'id') {
      return { data: null, count: dir.discipleCount, error: null }
    }
    // the directory search pool
    return { data: [], error: null }
  }
  return control
}

const disciplerProfile = {
  id: 'u1',
  member_id: 'm1',
  role: 'member',
  is_active: true,
}

function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <StoreProvider>{children}</StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

function AuthProbe() {
  const { status, role, refreshRole } = useAuth()
  const [lastRefresh, setLastRefresh] = useState('none')
  return (
    <div>
      <span data-testid="auth">{`${status}:${role.kind}`}</span>
      <span data-testid="refresh">{lastRefresh}</span>
      <button
        type="button"
        onClick={() =>
          void refreshRole().then((ok) => setLastRefresh(ok ? 'ok' : 'failed'))
        }
      >
        refresh
      </button>
    </div>
  )
}

/** A screen with typed, unsaved state. */
function NoteDraft() {
  const [text, setText] = useState('')
  return (
    <input
      aria-label="Draft note"
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  )
}

function emit(event: string, session: unknown) {
  act(() => {
    fake.state.listener?.(event, session)
  })
}

const authText = () => screen.getByTestId('auth').textContent

/** Lets in-flight fake reads and their state updates settle. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  fake.state.session = sessionFor('u1')
  fake.state.listener = null
  fake.state.tables = {}
  fake.state.rpc = {}
  fake.state.rpcCalls = []
  fake.state.inserts = []
  fake.state.fromCalls = 0
})
afterEach(cleanup)

describe('auth lifecycle (live)', () => {
  it('a token refresh keeps the screen mounted and re-reads the role quietly', async () => {
    const control = serveDirectory({
      profile: disciplerProfile,
      discipleCount: 2,
    })
    render(
      <Providers>
        <RequireRole tree="discipler">
          <NoteDraft />
        </RequireRole>
      </Providers>,
    )
    const input = await screen.findByLabelText<HTMLInputElement>('Draft note')
    fireEvent.change(input, { target: { value: 'half-typed note' } })
    const readsBefore = control.profileReads

    emit('TOKEN_REFRESHED', sessionFor('u1', 't2'))
    expect(screen.queryByText('One moment…')).toBeNull()
    await waitFor(() => expect(control.profileReads).toBe(readsBefore + 1))

    emit('SIGNED_IN', sessionFor('u1', 't3'))
    expect(screen.queryByText('One moment…')).toBeNull()
    await waitFor(() => expect(control.profileReads).toBe(readsBefore + 2))

    expect(screen.getByLabelText<HTMLInputElement>('Draft note')).toBe(input)
    expect(input.value).toBe('half-typed note')
  })

  it('a failed first role read shows a retry screen, never no-access', async () => {
    const control = serveDirectory({
      profile: disciplerProfile,
      discipleCount: 2,
    })
    control.fail = true
    render(
      <Providers>
        <RequireRole tree="discipler">
          <NoteDraft />
        </RequireRole>
      </Providers>,
    )
    expect(await screen.findByText('Connection failed.')).toBeTruthy()
    expect(screen.queryByLabelText('Draft note')).toBeNull()

    control.fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByLabelText('Draft note')).toBeTruthy()
  })

  it('a failed refresh keeps the role already on screen', async () => {
    const control = serveDirectory({
      profile: disciplerProfile,
      discipleCount: 2,
    })
    render(
      <Providers>
        <AuthProbe />
      </Providers>,
    )
    await waitFor(() => expect(authText()).toBe('ready:discipler'))

    control.fail = true
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await waitFor(() =>
      expect(screen.getByTestId('refresh').textContent).toBe('failed'),
    )
    expect(authText()).toBe('ready:discipler')

    const reads = control.profileReads
    emit('TOKEN_REFRESHED', sessionFor('u1', 't2'))
    await waitFor(() => expect(control.profileReads).toBe(reads + 1))
    await settle()
    expect(authText()).toBe('ready:discipler')
    expect(screen.queryByText('Connection failed.')).toBeNull()
  })

  it('ignores a role read that lands after sign-out', async () => {
    const control = serveDirectory({
      profile: disciplerProfile,
      discipleCount: 2,
    })
    let release = () => {}
    control.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    render(
      <Providers>
        <AuthProbe />
      </Providers>,
    )
    await waitFor(() => expect(control.profileReads).toBe(1))
    expect(authText()).toBe('loading:no-access')

    emit('SIGNED_OUT', null)
    expect(authText()).toBe('signed-out:no-access')

    release()
    await waitFor(() => expect(control.memberReads).toBe(2))
    await settle()
    expect(authText()).toBe('signed-out:no-access')
  })

  it('a different user shows the loading state until their role lands', async () => {
    serveDirectory({ profile: disciplerProfile, discipleCount: 2 })
    render(
      <Providers>
        <AuthProbe />
      </Providers>,
    )
    await waitFor(() => expect(authText()).toBe('ready:discipler'))

    serveDirectory({
      profile: { id: 'u2', member_id: null, role: 'admin', is_active: true },
      discipleCount: 0,
    })
    emit('SIGNED_IN', sessionFor('u2'))
    expect(authText()).toBe('loading:no-access')
    await waitFor(() => expect(authText()).toBe('ready:admin'))
  })

  it('refreshRole lets a newly assigned discipler in without signing out', async () => {
    const dir: Directory = { profile: disciplerProfile, discipleCount: 0 }
    serveDirectory(dir)
    render(
      <Providers>
        <AuthProbe />
      </Providers>,
    )
    await waitFor(() => expect(authText()).toBe('ready:no-access'))

    dir.discipleCount = 1
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await waitFor(() => expect(authText()).toBe('ready:discipler'))
    expect(screen.getByTestId('refresh').textContent).toBe('ok')
  })
})

describe('session hygiene (live)', () => {
  function useSession() {
    return { auth: useAuth(), qc: useQueryClient() }
  }

  it('clears cached queries for another user and on sign-out, not on a token refresh', async () => {
    serveDirectory({ profile: disciplerProfile, discipleCount: 2 })
    const { result } = renderHook(useSession, { wrapper: Providers })
    await waitFor(() => expect(result.current.auth.status).toBe('ready'))
    const probe = ['probe']

    result.current.qc.setQueryData(probe, 'first user rows')
    emit('TOKEN_REFRESHED', sessionFor('u1', 't2'))
    expect(result.current.qc.getQueryData(probe)).toBe('first user rows')

    emit('SIGNED_IN', sessionFor('u2'))
    expect(result.current.qc.getQueryData(probe)).toBeUndefined()

    result.current.qc.setQueryData(probe, 'second user rows')
    emit('SIGNED_OUT', null)
    expect(result.current.qc.getQueryData(probe)).toBeUndefined()
  })

  it('signOut clears the cache', async () => {
    serveDirectory({ profile: disciplerProfile, discipleCount: 2 })
    const { result } = renderHook(useSession, { wrapper: Providers })
    await waitFor(() => expect(result.current.auth.status).toBe('ready'))
    result.current.qc.setQueryData(['probe'], 'rows')

    await act(async () => {
      await result.current.auth.signOut()
    })
    expect(result.current.qc.getQueryData(['probe'])).toBeUndefined()
  })

  it('makes no Supabase call inside the auth callback', async () => {
    const control = serveDirectory({
      profile: disciplerProfile,
      discipleCount: 2,
    })
    render(
      <Providers>
        <AuthProbe />
      </Providers>,
    )
    await waitFor(() => expect(authText()).toBe('ready:discipler'))
    const callsBefore = fake.state.fromCalls
    const readsBefore = control.profileReads

    act(() => {
      fake.state.listener?.('TOKEN_REFRESHED', sessionFor('u1', 't2'))
      expect(fake.state.fromCalls).toBe(callsBefore)
    })
    await waitFor(() => expect(control.profileReads).toBe(readsBefore + 1))
  })
})

describe('admin who is also a discipler (live)', () => {
  const adminProfile = {
    id: 'u1',
    member_id: 'm9',
    role: 'admin',
    is_active: true,
  }

  function useHarness() {
    return {
      auth: useAuth(),
      myMemberId: useMyMemberId(),
      addNewDisciple: useAddNewDisciple(),
    }
  }

  it('keeps the member link and adds disciples under it', async () => {
    serveDirectory({ profile: adminProfile, discipleCount: 3 })
    fake.state.rpc.add_disciple = () => ({ data: 'd-new', error: null })
    const { result } = renderHook(useHarness, { wrapper: Providers })
    await waitFor(() => expect(result.current.auth.status).toBe('ready'))

    expect(result.current.auth.role).toEqual({ kind: 'admin', memberId: 'm9' })
    expect(result.current.myMemberId).toBe('m9')

    let added = false
    await act(async () => {
      added = await result.current.addNewDisciple(
        'Test Newcomer',
        'New Believer',
      )
    })
    expect(added).toBe(true)
    const call = fake.state.rpcCalls.find((c) => c.fn === 'add_disciple')
    expect(call?.args).toMatchObject({ p_discipler_member: 'm9' })
  })

  it('an admin with no member link is still refused', async () => {
    serveDirectory({
      profile: { ...adminProfile, member_id: null },
      discipleCount: 0,
    })
    const { result } = renderHook(
      () => ({ ...useHarness(), store: useStore() }),
      { wrapper: Providers },
    )
    await waitFor(() => expect(result.current.auth.status).toBe('ready'))
    expect(result.current.myMemberId).toBeNull()

    let added = true
    await act(async () => {
      added = await result.current.addNewDisciple(
        'Test Newcomer',
        'New Believer',
      )
    })
    expect(added).toBe(false)
    expect(fake.state.rpcCalls.some((c) => c.fn === 'add_disciple')).toBe(false)
    expect(result.current.store.toast).toBe(
      'Only a discipler can add a disciple.',
    )
  })
})

describe('Quest Circle list (live)', () => {
  const circleRow = (id: string, name: string) => ({
    id,
    name,
    leader_id: 'm1',
    co_leader_id: null,
    satellites: { name: 'Main' },
  })

  function useCircleHarness() {
    return {
      auth: useAuth(),
      store: useStore(),
      lifeGroups: useLifeGroups(),
      createCircle: useCreateCircle(),
    }
  }

  it('reports a failed list refresh after starting a circle, and keeps its id', async () => {
    serveDirectory({ profile: disciplerProfile, discipleCount: 2 })
    let listFails = false
    fake.state.tables.cell_groups = () =>
      listFails
        ? { data: null, error: OFFLINE }
        : { data: [circleRow('c1', 'First')], error: null }
    fake.state.rpc.create_circle = () => ({ data: 'c-new', error: null })
    const { result } = renderHook(useCircleHarness, { wrapper: Providers })
    await waitFor(() => expect(result.current.auth.status).toBe('ready'))
    await waitFor(() => expect(result.current.lifeGroups.data).toHaveLength(1))

    listFails = true
    let id: string | null = null
    await act(async () => {
      id = await result.current.createCircle('Second')
    })
    expect(id).toBe('c-new')
    expect(result.current.store.toast).toBe(
      'Quest Circle started. Circle list not refreshed.',
    )
    expect(result.current.lifeGroups.error).not.toBeNull()
  })

  it('asks only for active circles that are not teams', async () => {
    serveDirectory({ profile: disciplerProfile, discipleCount: 2 })
    const seen: Array<Array<[string, unknown]>> = []
    fake.state.tables.cell_groups = (q) => {
      seen.push([...q.filters])
      return { data: [circleRow('c1', 'First')], error: null }
    }
    const { result } = renderHook(useCircleHarness, { wrapper: Providers })
    await waitFor(() => expect(result.current.lifeGroups.data).toHaveLength(1))
    expect(seen[0]).toEqual(
      expect.arrayContaining([
        ['is_active', true],
        ['is_team', false],
      ]),
    )
  })

  it('confirms a started circle once the list refreshes', async () => {
    serveDirectory({ profile: disciplerProfile, discipleCount: 2 })
    const rows = [circleRow('c1', 'First')]
    fake.state.tables.cell_groups = () => ({ data: [...rows], error: null })
    fake.state.rpc.create_circle = () => {
      rows.push(circleRow('c-new', 'Second'))
      return { data: 'c-new', error: null }
    }
    const { result } = renderHook(useCircleHarness, { wrapper: Providers })
    await waitFor(() => expect(result.current.auth.status).toBe('ready'))
    await waitFor(() => expect(result.current.lifeGroups.data).toHaveLength(1))

    await act(async () => {
      await result.current.createCircle('Second')
    })
    expect(result.current.store.toast).toBe('Quest Circle started.')
    expect(result.current.lifeGroups.data.map((g) => g.id)).toContain('c-new')
  })

  it('the add sheet holds the circle choice while the list loads or fails', async () => {
    serveDirectory({ profile: disciplerProfile, discipleCount: 2 })
    let listState: 'pending' | 'fail' | 'ok' = 'pending'
    let releaseList = () => {}
    fake.state.tables.cell_groups = async () => {
      if (listState === 'pending') {
        await new Promise<void>((resolve) => {
          releaseList = resolve
        })
      }
      return listState === 'ok'
        ? {
            data: [circleRow('c1', 'First'), circleRow('c2', 'Second')],
            error: null,
          }
        : { data: null, error: OFFLINE }
    }
    render(
      <Providers>
        <AddDiscipleSheet />
      </Providers>,
    )
    expect(await screen.findByText('Loading Quest Circles…')).toBeTruthy()
    expect(screen.queryByText('No circle')).toBeNull()

    listState = 'fail'
    releaseList()
    expect(await screen.findByText('Quest Circles not loaded.')).toBeTruthy()
    expect(screen.queryByText('No circle')).toBeNull()

    listState = 'ok'
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Choose a Quest Circle first.')).toBeTruthy()
    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
  })
})

const engagementRow = (id: string, disciplerId: string, name: string) => ({
  disciple_id: id,
  member_id: `mem-${id}`,
  name,
  stage: 'Growing',
  discipler_id: disciplerId,
  cohort: null,
  last_activity_on: null,
  last_activity_type: null,
  days_since: 30,
  engagement: 'red',
  life_group_id: null,
  life_group_name: null,
  checklist_done: 0,
  checklist_total: 3,
  in_stage_since: null,
})

type SheetArg = Parameters<ReturnType<typeof useStore>['openSheet']>[0]

function SheetOpener({ sheet }: { sheet: SheetArg }) {
  const { openSheet } = useStore()
  return (
    <button type="button" onClick={() => openSheet(sheet)}>
      open sheet
    </button>
  )
}

describe('disciple sheets (live)', () => {
  beforeEach(() => {
    serveDirectory({ profile: disciplerProfile, discipleCount: 1 })
    fake.state.tables.disciple_engagement = () => ({
      data: [engagementRow('d1', 'm1', 'Test Disciple')],
      error: null,
    })
  })

  it('Confirm promote ignores repeat taps while the request runs', async () => {
    let releasePromote = () => {}
    fake.state.rpc.promote_disciple = async () => {
      await new Promise<void>((resolve) => {
        releasePromote = resolve
      })
      return { data: null, error: null }
    }
    render(
      <Providers>
        <SheetOpener sheet={{ kind: 'promote', discipleId: 'd1' }} />
        <Sheets />
      </Providers>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'open sheet' }))
    expect(await screen.findByText('Promote Test')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/Promotion note/), {
      target: { value: 'Leads devotions well.' },
    })

    const confirm = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Confirm',
    })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Promoting…' })
          .disabled,
      ).toBe(true),
    )
    expect(
      fake.state.rpcCalls.filter((c) => c.fn === 'promote_disciple'),
    ).toHaveLength(1)
    // The stage on screen goes along, so the database refuses a second step.
    expect(
      fake.state.rpcCalls.find((c) => c.fn === 'promote_disciple')?.args,
    ).toEqual({
      p_disciple: 'd1',
      p_note: 'Leads devotions well.',
      p_from_stage_db: 'Growing',
    })

    releasePromote()
    await waitFor(() => expect(screen.queryByText('Promote Test')).toBeNull())
    expect(
      fake.state.rpcCalls.filter((c) => c.fn === 'promote_disciple'),
    ).toHaveLength(1)
  })

  it('the log sheet caps the date at today and refuses a later one', async () => {
    render(
      <Providers>
        <SheetOpener sheet={{ kind: 'log', discipleId: 'd1' }} />
        <Sheets />
        <Toast />
      </Providers>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'open sheet' }))
    await screen.findByText('Log activity')
    const dateInput =
      document.querySelector<HTMLInputElement>('input[type="date"]')!
    expect(dateInput.max).toBe(toISODate(today()))

    fireEvent.change(dateInput, {
      target: { value: toISODate(addDays(today(), 1)) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }))
    expect(
      await screen.findByText(
        'Activity date in the future. Pick today or earlier.',
      ),
    ).toBeTruthy()
    expect(fake.state.inserts).toHaveLength(0)
    // the sheet stays open for a fix
    expect(screen.getByText('Log activity')).toBeTruthy()
  })
})

describe('"mine" for an admin (live)', () => {
  beforeEach(() => {
    fake.state.tables.disciple_engagement = () => ({
      data: [
        engagementRow('d1', 'm9', 'Test Own'),
        engagementRow('d2', 'm1', 'Test Other'),
      ],
      error: null,
    })
  })

  function useMine() {
    return { auth: useAuth(), mine: useDisciples('mine').data }
  }

  it('a linked admin sees only their own disciples', async () => {
    serveDirectory({
      profile: { id: 'u1', member_id: 'm9', role: 'admin', is_active: true },
      discipleCount: 1,
    })
    const { result } = renderHook(useMine, { wrapper: Providers })
    await waitFor(() => expect(result.current.auth.status).toBe('ready'))
    await waitFor(() =>
      expect(result.current.mine.map((d) => d.id)).toEqual(['d1']),
    )
  })

  it('an unlinked admin still sees every disciple', async () => {
    serveDirectory({
      profile: { id: 'u1', member_id: null, role: 'admin', is_active: true },
      discipleCount: 0,
    })
    const { result } = renderHook(useMine, { wrapper: Providers })
    await waitFor(() => expect(result.current.auth.status).toBe('ready'))
    await waitFor(() =>
      expect(result.current.mine.map((d) => d.id)).toEqual(['d1', 'd2']),
    )
  })
})

function SheetKind() {
  const { sheet } = useStore()
  return <span data-testid="sheet">{sheet?.kind ?? 'none'}</span>
}

function NamedOpener({ sheet, label }: { sheet: SheetArg; label: string }) {
  const { openSheet } = useStore()
  return (
    <button type="button" onClick={() => openSheet(sheet)}>
      {label}
    </button>
  )
}

describe('add sheet requests (live)', () => {
  const poolRow = (id: string, name: string, disciplerId: string | null) => ({
    id,
    name,
    discipleship_stage: 'Growing',
    discipler_id: disciplerId,
    satellite: null,
  })

  /** Serves the directory search pool on top of serveDirectory. */
  function servePool(rows: Array<ReturnType<typeof poolRow>>) {
    const base = fake.state.tables.members!
    const pool = { reads: 0, rows }
    fake.state.tables.members = (q) => {
      if (q.columns.includes('discipler_id')) {
        pool.reads += 1
        return { data: [...pool.rows], error: null }
      }
      return base(q)
    }
    return pool
  }

  /** Holds link_disciple until the returned function answers it. */
  function holdLink() {
    let answer: (resp: Resp) => void = () => {}
    fake.state.rpc.link_disciple = () =>
      new Promise<Resp>((resolve) => {
        answer = resolve
      })
    return (resp: Resp) => answer(resp)
  }

  const addSheet: SheetArg = { kind: 'add' }

  async function searchFor(text: string) {
    fireEvent.click(screen.getByRole('button', { name: 'open add' }))
    fireEvent.change(
      await screen.findByLabelText('Search the church directory'),
      { target: { value: text } },
    )
  }

  beforeEach(() => {
    serveDirectory({ profile: disciplerProfile, discipleCount: 2 })
  })

  it('holds every Add and the scrim while a link runs, and re-reads a refused row', async () => {
    const pool = servePool([
      poolRow('p1', 'Test Alpha', null),
      poolRow('p2', 'Test Alpha Two', null),
    ])
    const answerLink = holdLink()
    render(
      <Providers>
        <NamedOpener sheet={addSheet} label="open add" />
        <Sheets />
        <Toast />
        <SheetKind />
      </Providers>,
    )
    await searchFor('Test Alpha')
    const adds = await screen.findAllByRole<HTMLButtonElement>('button', {
      name: 'Add',
    })
    expect(adds).toHaveLength(2)

    fireEvent.click(adds[0])
    await screen.findByRole('button', { name: 'Adding…' })
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled,
    ).toBe(true)
    const scrim = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Close',
    })
    expect(scrim.disabled).toBe(true)
    fireEvent.click(scrim)
    expect(screen.getByTestId('sheet').textContent).toBe('add')

    const readsBefore = pool.reads
    pool.rows = [
      poolRow('p1', 'Test Alpha', 'm7'),
      poolRow('p2', 'Test Alpha Two', null),
    ]
    answerLink({
      data: null,
      error: { code: 'P0001', message: 'Already walks with another discipler' },
    })
    expect(
      await screen.findByText('Already walks with another discipler'),
    ).toBeTruthy()
    await waitFor(() => expect(pool.reads).toBeGreaterThan(readsBefore))
    await waitFor(() => {
      const left = screen.getAllByRole<HTMLButtonElement>('button', {
        name: 'Add',
      })
      expect(left).toHaveLength(1)
      expect(left[0].disabled).toBe(false)
    })
    expect(screen.getByText('Walks with another discipler')).toBeTruthy()
    expect(screen.getByTestId('sheet').textContent).toBe('add')
  })

  it('shows a fallback, not the raw error, for a non-product failure', async () => {
    servePool([poolRow('p1', 'Test Alpha', null)])
    fake.state.rpc.link_disciple = () => ({
      data: null,
      error: { code: '42501', message: 'permission denied for function x' },
    })
    render(
      <Providers>
        <NamedOpener sheet={addSheet} label="open add" />
        <Sheets />
        <Toast />
      </Providers>,
    )
    await searchFor('Test Alpha')
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Disciple not added. Retry.')).toBeTruthy()
    expect(screen.queryByText(/permission denied/)).toBeNull()
  })

  it('closes the add sheet on success, but never a sheet opened meanwhile', async () => {
    servePool([poolRow('p1', 'Test Alpha', null)])
    let answerLink = holdLink()
    render(
      <Providers>
        <NamedOpener sheet={addSheet} label="open add" />
        <NamedOpener
          sheet={{ kind: 'sched', discipleId: null }}
          label="open schedule"
        />
        <Sheets />
        <Toast />
        <SheetKind />
      </Providers>,
    )
    await searchFor('Test Alpha')
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    await screen.findByRole('button', { name: 'Adding…' })

    fireEvent.click(screen.getByRole('button', { name: 'open schedule' }))
    expect(screen.getByTestId('sheet').textContent).toBe('sched')
    answerLink({ data: 'd-new', error: null })
    expect(await screen.findByText('Test added to Disciples.')).toBeTruthy()
    expect(screen.getByTestId('sheet').textContent).toBe('sched')

    answerLink = holdLink()
    await searchFor('Test Alpha')
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    await screen.findByRole('button', { name: 'Adding…' })
    answerLink({ data: 'd-new', error: null })
    await waitFor(() =>
      expect(screen.getByTestId('sheet').textContent).toBe('none'),
    )
  })
})

describe('reassign with a Quest Circle (live)', () => {
  function setup() {
    serveDirectory({
      profile: { id: 'u1', member_id: null, role: 'admin', is_active: true },
      discipleCount: 0,
    })
    fake.state.tables.disciple_engagement = () => ({
      data: [
        engagementRow('d1', 'm1', 'Test One'),
        engagementRow('d2', 'm1', 'Test Two'),
        engagementRow('d3', 'm1', 'Test Three'),
      ],
      error: null,
    })
    return renderHook(
      () => ({
        store: useStore(),
        all: useDisciples('all').data,
        reassign: useReassignDisciples(),
      }),
      { wrapper: Providers },
    )
  }

  it('sends discipler and circle in one call, with no separate placement', async () => {
    const calls: Array<Record<string, unknown>> = []
    let placements = 0
    fake.state.rpc.reassign_disciples = (args) => {
      calls.push(args as Record<string, unknown>)
      return { data: 3, error: null }
    }
    fake.state.rpc.place_in_circle = () => {
      placements += 1
      return { data: null, error: null }
    }
    const { result } = setup()
    await waitFor(() => expect(result.current.all).toHaveLength(3))

    let complete = false
    await act(async () => {
      complete = await result.current.reassign(['d1', 'd2', 'd3'], 'm5', 'c1')
    })
    expect(complete).toBe(true)
    expect(calls).toEqual([
      { p_disciples: ['d1', 'd2', 'd3'], p_to_member: 'm5', p_circle: 'c1' },
    ])
    expect(placements).toBe(0)
    expect(result.current.store.toast).toBe('3 disciples reassigned.')
  })

  it('a refused circle moves nobody and shows the reason, never a raw error', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.all).toHaveLength(3))

    fake.state.rpc.reassign_disciples = () => ({
      data: null,
      error: {
        code: 'P0001',
        message: 'Circle not run by that discipler. Pick one of their circles.',
      },
    })
    let complete = true
    await act(async () => {
      complete = await result.current.reassign(['d1'], 'm5', 'c9')
    })
    expect(complete).toBe(false)
    expect(result.current.store.toast).toBe(
      'Circle not run by that discipler. Pick one of their circles.',
    )

    fake.state.rpc.reassign_disciples = () => ({
      data: null,
      error: { code: '42501', message: 'permission denied for function x' },
    })
    await act(async () => {
      complete = await result.current.reassign(['d1'], 'm5', null)
    })
    expect(complete).toBe(false)
    expect(result.current.store.toast).toBe('Reassign failed. Refresh and retry.')
  })
})

describe('lists joined at render (live)', () => {
  const adminProfile = {
    id: 'u1',
    member_id: null,
    role: 'admin',
    is_active: true,
  }

  it("a discipler's circle follows the circle list, even when it loads last", async () => {
    serveDirectory({ profile: adminProfile, discipleCount: 0 })
    fake.state.tables.discipler_load = () => ({
      data: [
        {
          discipler_member_id: 'm1',
          discipler_name: 'Test Leader',
          load: 2,
          days_since_log: 3,
          inactive: false,
        },
      ],
      error: null,
    })
    let releaseCircles = () => {}
    fake.state.tables.cell_groups = async () => {
      await new Promise<void>((resolve) => {
        releaseCircles = resolve
      })
      return {
        data: [
          { id: 'c-z', name: 'Zeta', leader_id: 'm1', co_leader_id: null },
          { id: 'c-a', name: 'Alpha', leader_id: 'm1', co_leader_id: null },
        ],
        error: null,
      }
    }
    const { result } = renderHook(() => useDisciplers().data, {
      wrapper: Providers,
    })
    await waitFor(() => expect(result.current).toHaveLength(1))
    expect(result.current[0].lifeGroupId).toBeNull()

    releaseCircles()
    await waitFor(() => expect(result.current[0].lifeGroupId).toBe('c-a'))
  })

  it('meetings show only disciples in the loaded list, named from it', async () => {
    serveDirectory({ profile: adminProfile, discipleCount: 0 })
    fake.state.tables.disciple_engagement = () => ({
      data: [engagementRow('d1', 'm1', 'Test One')],
      error: null,
    })
    const meetingRow = (id: string, discipleId: string) => ({
      id,
      disciple_id: discipleId,
      scheduled_at: '2026-10-12T11:00:00.000Z',
      mode: 'inperson',
      place: 'Main',
      status: 'upcoming',
      note: null,
    })
    fake.state.tables.meetings = () => ({
      data: [meetingRow('mt1', 'd1'), meetingRow('mt2', 'd-archived')],
      error: null,
    })
    const { result } = renderHook(() => useMeetings(), { wrapper: Providers })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data.map((m) => [m.id, m.discipleName])).toEqual([
      ['mt1', 'Test One'],
    ])
  })
})
