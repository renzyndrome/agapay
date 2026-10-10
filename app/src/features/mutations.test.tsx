// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AuthProvider } from '#/auth'
import { StoreProvider, useStore } from '#/store'
import { addDays, toISODate, today } from '#/lib/format'
import { useDisciples } from '#/features/disciples/hooks'
import {
  useDirectorySearchPool,
  useLifeGroups,
} from '#/features/directory/hooks'
import {
  useAddNewDisciple,
  useCompleteMeeting,
  useCreateCircle,
  useLinkDisciple,
  useLogActivity,
  usePromoteDisciple,
  useReassignDisciples,
  useToggleChecklistItem,
} from '#/features/mutations'

/** Force demo mode regardless of any local .env (vi.mock is hoisted above
 *  the imports). Without this the suite's
 *  result depends on whether a developer happens to have `app/.env.local`
 *  pointing at a live project — these tests are specifically about the
 *  seeded path the deployed prototype uses. */
vi.mock('#/lib/supabase', () => ({
  isDemoMode: true,
  hasSupabaseEnv: false,
  getSupabase: () => null,
}))

/** These run with no Supabase env, so isDemoMode is true — i.e. they cover the
 *  exact path the deployed prototype uses: mutation hooks must still drive the
 *  in-memory store, and the derived queue must react. */

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <StoreProvider>{children}</StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

function useHarness() {
  return {
    store: useStore(),
    mine: useDisciples('mine').data,
    all: useDisciples('all').data,
    logActivity: useLogActivity(),
    completeMeeting: useCompleteMeeting(),
    promote: usePromoteDisciple(),
    toggle: useToggleChecklistItem(),
    directory: useDirectorySearchPool().data,
    linkDisciple: useLinkDisciple(),
    addNewDisciple: useAddNewDisciple(),
    createCircle: useCreateCircle(),
    reassign: useReassignDisciples(),
    lifeGroups: useLifeGroups().data,
  }
}

describe('demo-mode mutations (the deployed prototype path)', () => {
  it('logging an activity resets engagement and clears the disciple from the queue', async () => {
    const { result } = renderHook(useHarness, { wrapper })

    const atRisk = result.current.mine.find((d) => d.engagement === 'red')
    expect(atRisk, 'seed should contain an at-risk disciple').toBeDefined()

    await act(async () => {
      await result.current.logActivity(
        atRisk!.id,
        'One-on-one',
        '2026-08-15',
        'good talk',
      )
    })

    await waitFor(() => {
      const after = result.current.mine.find((d) => d.id === atRisk!.id)
      expect(after?.days).toBe(0)
      expect(after?.engagement).toBe('green')
    })
  })

  it('refuses an activity dated after today and keeps the clock', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const atRisk = result.current.mine.find((d) => d.engagement === 'red')!
    const tomorrow = toISODate(addDays(today(), 1))

    await act(async () => {
      await result.current.logActivity(atRisk.id, 'One-on-one', tomorrow, '')
    })

    expect(result.current.store.toast).toBe(
      'Activity date in the future. Pick today or earlier.',
    )
    const after = result.current.mine.find((d) => d.id === atRisk.id)
    expect(after?.days).toBe(atRisk.days)
    expect(after?.engagement).toBe('red')
  })

  it('reports the logged activity and names the disciple', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const target = result.current.mine[0]

    await act(async () => {
      await result.current.logActivity(
        target.id,
        'Life Group',
        '2026-08-15',
        '',
      )
    })

    await waitFor(() => {
      expect(result.current.store.toast).toBe(
        `Life Group logged for ${target.name.split(' ')[0]}.`,
      )
    })
  })

  it('completing a meeting resets that disciple too', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const meeting = result.current.store.meetings.find(
      (m) => m.status === 'upcoming',
    )
    expect(meeting).toBeDefined()

    await act(async () => {
      await result.current.completeMeeting(
        meeting!.id,
        'talked about consistency',
      )
    })

    await waitFor(() => {
      const d = result.current.all.find((x) => x.id === meeting!.discipleId)
      expect(d?.days).toBe(0)
    })
  })

  it('promotion is refused without a note, and accepted with one', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const target = result.current.all.find((d) => d.stage !== 'Leader')
    expect(target).toBeDefined()

    await act(async () => {
      await result.current.promote(target!.id, '   ')
    })
    await waitFor(() => {
      expect(result.current.store.toast).toBe('Note required to promote.')
    })
    expect(
      result.current.all.find((d) => d.id === target!.id)?.stage,
      'stage must not move without a note',
    ).toBe(target!.stage)

    await act(async () => {
      await result.current.promote(target!.id, 'Ready. Leads devotions well.')
    })
    await waitFor(() => {
      expect(
        result.current.all.find((d) => d.id === target!.id)?.stage,
      ).not.toBe(target!.stage)
    })
  })

  it('toggling a checklist item updates progress', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const target = result.current.all[0]
    const before = target.checklistDone

    await act(async () => {
      await result.current.toggle(target.id, `${target.id}-0`, 0, true)
    })

    await waitFor(() => {
      const after = result.current.all.find((d) => d.id === target.id)
      expect(after?.checklistDone).not.toBe(before)
    })
  })

  it('linking a directory member nobody walks with adds them to Disciples', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const unassigned = result.current.directory.find(
      (m) => m.disciplerId === null,
    )
    expect(
      unassigned,
      'demo directory should hold an unassigned member',
    ).toBeDefined()
    const before = result.current.mine.length

    await act(async () => {
      await result.current.linkDisciple({
        id: unassigned!.id,
        name: unassigned!.name,
      })
    })

    await waitFor(() => {
      expect(result.current.mine.length).toBe(before + 1)
      expect(result.current.mine.some((d) => d.name === unassigned!.name)).toBe(
        true,
      )
      const entry = result.current.directory.find(
        (m) => m.id === unassigned!.id,
      )
      expect(entry?.disciplerId).toBe(result.current.store.currentDisciplerId)
      expect(result.current.store.toast).toContain('added to Disciples')
    })
  })

  it('adding a new believer creates a disciple at the chosen stage', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const before = result.current.mine.length

    await act(async () => {
      await result.current.addNewDisciple('  Test Newcomer ', 'New Believer')
    })

    await waitFor(() => {
      expect(result.current.mine.length).toBe(before + 1)
      const added = result.current.mine.find((d) => d.name === 'Test Newcomer')
      expect(added?.stage).toBe('New Believer')
      expect(added?.checklistTotal).toBeGreaterThan(0)
    })
  })

  it('adding a new believer refuses a name shorter than 2 letters', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const before = result.current.all.length

    await act(async () => {
      await result.current.addNewDisciple(' A ', 'New Believer')
    })

    expect(result.current.all.length).toBe(before)
    expect(result.current.store.toast).toBe('Full name required.')
  })

  it('starting a circle makes the discipler its leader', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    let id: string | null = null

    await act(async () => {
      id = await result.current.createCircle('  Test Circle ')
    })

    await waitFor(() => {
      const circle = result.current.lifeGroups.find((g) => g.id === id)
      expect(circle?.name).toBe('Test Circle')
      expect(circle?.leaderDisciplerId).toBe(
        result.current.store.currentDisciplerId,
      )
    })
  })

  it('starting a circle refuses a name already in use', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const taken = result.current.lifeGroups[0].name
    const before = result.current.lifeGroups.length
    let id: string | null = 'unset'

    await act(async () => {
      id = await result.current.createCircle(taken.toLowerCase())
    })

    expect(id).toBeNull()
    expect(result.current.lifeGroups.length).toBe(before)
    expect(result.current.store.toast).toBe('Quest Circle name already in use.')
  })

  it('adding with a circle puts the disciple in that circle', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    let circleId: string | null = null
    await act(async () => {
      circleId = await result.current.createCircle('Test Circle')
    })

    await act(async () => {
      await result.current.addNewDisciple('Test Placed', 'Growing', circleId)
    })

    await waitFor(() => {
      const added = result.current.mine.find((d) => d.name === 'Test Placed')
      expect(added?.lifeGroupId).toBe(circleId)
    })
  })

  it('adding with no circle leaves the disciple outside every circle', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const unassigned = result.current.directory.find(
      (m) => m.disciplerId === null,
    )

    await act(async () => {
      await result.current.linkDisciple(
        { id: unassigned!.id, name: unassigned!.name },
        null,
      )
    })

    await waitFor(() => {
      const added = result.current.mine.find((d) => d.name === unassigned!.name)
      expect(added).toBeDefined()
      expect(added?.lifeGroupId).toBeNull()
    })
  })

  it('reassigning with a Quest Circle moves the disciples into it', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const target = result.current.all[0]
    const otherCircle = result.current.lifeGroups.find(
      (g) => g.id !== target.lifeGroupId,
    )!

    await act(async () => {
      await result.current.reassign(
        [target.id],
        otherCircle.leaderDisciplerId!,
        otherCircle.id,
      )
    })

    await waitFor(() => {
      const moved = result.current.all.find((d) => d.id === target.id)
      expect(moved?.disciplerId).toBe(otherCircle.leaderDisciplerId)
      expect(moved?.lifeGroupId).toBe(otherCircle.id)
    })
  })

  it('reassigning resolves true so the admin table can clear its selection', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const [first, second] = result.current.all
    const other = result.current.lifeGroups.find(
      (g) =>
        g.leaderDisciplerId !== null &&
        g.leaderDisciplerId !== first.disciplerId,
    )!
    let resolved: boolean | null = null

    await act(async () => {
      resolved = await result.current.reassign(
        [first.id, second.id],
        other.leaderDisciplerId!,
        null,
      )
    })

    expect(resolved).toBe(true)
    await waitFor(() => {
      for (const id of [first.id, second.id]) {
        const moved = result.current.all.find((d) => d.id === id)
        expect(moved?.disciplerId).toBe(other.leaderDisciplerId)
      }
      expect(result.current.store.toast).toMatch(/^2 disciples reassigned/)
    })
  })

  it('reassigning with no Quest Circle leaves circles the new discipler does not run', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const target = result.current.all[0]
    const before = target.lifeGroupId
    const other = result.current.lifeGroups.find((g) => g.id !== before)!

    await act(async () => {
      await result.current.reassign([target.id], other.leaderDisciplerId!, null)
    })

    await waitFor(() => {
      const moved = result.current.all.find((d) => d.id === target.id)
      expect(moved?.disciplerId).toBe(other.leaderDisciplerId)
      expect(moved?.lifeGroupId).toBeNull()
    })
  })

  it('reassigning with no Quest Circle keeps a circle the new discipler leads', async () => {
    const { result } = renderHook(useHarness, { wrapper })
    const target = result.current.all.find((d) => d.lifeGroupId)!
    const circle = result.current.lifeGroups.find((g) => g.id === target.lifeGroupId)!

    await act(async () => {
      await result.current.reassign([target.id], circle.leaderDisciplerId!, null)
    })

    await waitFor(() => {
      const moved = result.current.all.find((d) => d.id === target.id)
      expect(moved?.lifeGroupId).toBe(circle.id)
    })
  })
})
