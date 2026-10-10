import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchRoleInputs } from '#/lib/roleLoad'

interface Resp {
  data?: unknown
  count?: number | null
  error: { message: string } | null
}

/** Answers each read by table and selected columns. */
function fakeClient(answer: (table: string, columns: string) => Resp) {
  const reads: Array<string> = []
  const from = (table: string) => {
    let columns = ''
    const run = () => {
      reads.push(`${table}:${columns}`)
      return Promise.resolve(answer(table, columns))
    }
    const builder = {
      select(cols: string) {
        columns = cols
        return builder
      },
      eq: () => builder,
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
  return { client: { from } as unknown as SupabaseClient, reads }
}

const OFFLINE = { message: 'Failed to fetch' }
const profile = { id: 'u1', member_id: 'm1', role: 'member', is_active: true }

describe('fetchRoleInputs', () => {
  it('reads the profile, disciple count and member name', async () => {
    const { client } = fakeClient((table, columns) => {
      if (table === 'user_profiles') return { data: profile, error: null }
      if (columns === 'name')
        return { data: { name: 'Test Member' }, error: null }
      return { count: 3, error: null }
    })
    await expect(fetchRoleInputs(client, 'u1')).resolves.toEqual({
      profile,
      discipleCount: 3,
      memberName: 'Test Member',
    })
  })

  it('skips the member reads for an unlinked or missing profile', async () => {
    const unlinked = fakeClient(() => ({
      data: { ...profile, member_id: null },
      error: null,
    }))
    await expect(fetchRoleInputs(unlinked.client, 'u1')).resolves.toMatchObject(
      {
        discipleCount: 0,
        memberName: '',
      },
    )
    expect(unlinked.reads).toHaveLength(1)

    const missing = fakeClient(() => ({ data: null, error: null }))
    await expect(fetchRoleInputs(missing.client, 'u1')).resolves.toEqual({
      profile: null,
      discipleCount: 0,
      memberName: '',
    })
  })

  it('throws when the profile read fails', async () => {
    const { client } = fakeClient(() => ({ data: null, error: OFFLINE }))
    await expect(fetchRoleInputs(client, 'u1')).rejects.toEqual(OFFLINE)
  })

  it('throws when the disciple count fails, never reading it as zero', async () => {
    const { client } = fakeClient((table, columns) => {
      if (table === 'user_profiles') return { data: profile, error: null }
      if (columns === 'name')
        return { data: { name: 'Test Member' }, error: null }
      return { count: null, error: OFFLINE }
    })
    await expect(fetchRoleInputs(client, 'u1')).rejects.toEqual(OFFLINE)
  })

  it('throws when the member name read fails', async () => {
    const { client } = fakeClient((table, columns) => {
      if (table === 'user_profiles') return { data: profile, error: null }
      if (columns === 'name') return { data: null, error: OFFLINE }
      return { count: 2, error: null }
    })
    await expect(fetchRoleInputs(client, 'u1')).rejects.toEqual(OFFLINE)
  })
})
