import { describe, expect, it } from 'vitest'
import {
  canAccess,
  friendlySignInError,
  landingPath,
  memberIdOf,
  noAccessHeading,
  noAccessMessage,
  resolveRole,
} from '#/lib/auth'
import type { DirectoryProfile } from '#/lib/auth'

const profile = (over: Partial<DirectoryProfile> = {}): DirectoryProfile => ({
  id: 'u1',
  member_id: 'm1',
  role: 'member',
  ...over,
})

describe('resolveRole', () => {
  it('treats a directory admin as an Agapay admin', () => {
    expect(resolveRole({ profile: profile({ role: 'admin' }), discipleCount: 0 })).toEqual({
      kind: 'admin',
      memberId: 'm1',
    })
  })

  it('admin does not need a member link', () => {
    const role = resolveRole({
      profile: profile({ role: 'admin', member_id: null }),
      discipleCount: 0,
    })
    expect(role).toEqual({ kind: 'admin', memberId: null })
  })

  it('keeps the member link of an admin who also disciples', () => {
    const role = resolveRole({
      profile: profile({ role: 'admin', member_id: 'm7' }),
      discipleCount: 4,
    })
    expect(role).toEqual({ kind: 'admin', memberId: 'm7' })
    expect(landingPath(role)).toBe('/admin')
    expect(canAccess(role, 'admin')).toBe(true)
    expect(canAccess(role, 'discipler')).toBe(true)
  })

  it('recognises a discipler implicitly, by assigned disciples', () => {
    expect(resolveRole({ profile: profile(), discipleCount: 3 })).toEqual({
      kind: 'discipler',
      memberId: 'm1',
      discipleCount: 3,
    })
  })

  it('does NOT require the discipleship role grant (GAPS #33)', () => {
    // role='member' + assigned disciples is the recommended, safest config
    const role = resolveRole({ profile: profile({ role: 'member' }), discipleCount: 1 })
    expect(role.kind).toBe('discipler')
  })

  it('still works for someone the church gave the discipleship role', () => {
    const role = resolveRole({
      profile: profile({ role: 'discipleship' }),
      discipleCount: 2,
    })
    expect(role.kind).toBe('discipler')
  })

  it('denies a member who disciples nobody', () => {
    expect(resolveRole({ profile: profile(), discipleCount: 0 })).toEqual({
      kind: 'no-access',
      reason: 'no-disciples',
    })
  })

  it('denies an unlinked account', () => {
    expect(resolveRole({ profile: profile({ member_id: null }), discipleCount: 5 })).toEqual({
      kind: 'no-access',
      reason: 'no-member-link',
    })
  })

  it('denies an account with no directory profile', () => {
    expect(resolveRole({ profile: null, discipleCount: 0 })).toEqual({
      kind: 'no-access',
      reason: 'no-profile',
    })
  })

  it('denies a deactivated account', () => {
    expect(
      resolveRole({ profile: profile({ is_active: false }), discipleCount: 3 }),
    ).toEqual({ kind: 'no-access', reason: 'inactive' })
  })

  it('denies a deactivated admin too', () => {
    expect(
      resolveRole({
        profile: profile({ role: 'admin', is_active: false }),
        discipleCount: 0,
      }),
    ).toEqual({ kind: 'no-access', reason: 'inactive' })
  })

  it('reads a null or missing is_active as active', () => {
    expect(
      resolveRole({ profile: profile({ is_active: null }), discipleCount: 1 }).kind,
    ).toBe('discipler')
    expect(resolveRole({ profile: profile(), discipleCount: 1 }).kind).toBe(
      'discipler',
    )
    expect(
      resolveRole({ profile: profile({ role: 'admin', is_active: true }), discipleCount: 0 })
        .kind,
    ).toBe('admin')
  })

  it('does not promote other staff roles (finance, registration) into Agapay', () => {
    for (const role of ['finance', 'registration', 'satellite']) {
      expect(resolveRole({ profile: profile({ role }), discipleCount: 0 }).kind).toBe(
        'no-access',
      )
    }
  })
})

describe('memberIdOf', () => {
  it('reads the member link of a discipler or a linked admin', () => {
    expect(memberIdOf({ kind: 'discipler', memberId: 'm1', discipleCount: 2 })).toBe('m1')
    expect(memberIdOf({ kind: 'admin', memberId: 'm2' })).toBe('m2')
  })

  it('is null for an unlinked admin and for no-access', () => {
    expect(memberIdOf({ kind: 'admin', memberId: null })).toBeNull()
    expect(memberIdOf({ kind: 'no-access', reason: 'no-disciples' })).toBeNull()
  })
})

describe('landingPath', () => {
  it('routes each role to its own surface', () => {
    expect(landingPath({ kind: 'admin', memberId: null })).toBe('/admin')
    expect(landingPath({ kind: 'admin', memberId: 'm1' })).toBe('/admin')
    expect(landingPath({ kind: 'discipler', memberId: 'm1', discipleCount: 1 })).toBe('/')
    expect(landingPath({ kind: 'no-access', reason: 'no-disciples' })).toBe('/no-access')
    expect(landingPath({ kind: 'no-access', reason: 'inactive' })).toBe('/no-access')
  })
})

describe('canAccess', () => {
  const discipler = { kind: 'discipler', memberId: 'm1', discipleCount: 1 } as const
  const admin = { kind: 'admin', memberId: null } as const
  const denied = { kind: 'no-access', reason: 'no-disciples' } as const

  it('keeps disciplers out of the admin tree', () => {
    expect(canAccess(discipler, 'admin')).toBe(false)
    expect(canAccess(discipler, 'discipler')).toBe(true)
  })

  it('lets admins see both surfaces', () => {
    expect(canAccess(admin, 'admin')).toBe(true)
    expect(canAccess(admin, 'discipler')).toBe(true)
  })

  it('blocks no-access from everything', () => {
    expect(canAccess(denied, 'admin')).toBe(false)
    expect(canAccess(denied, 'discipler')).toBe(false)
  })

  it('blocks a deactivated account from both surfaces', () => {
    const inactive = { kind: 'no-access', reason: 'inactive' } as const
    expect(canAccess(inactive, 'admin')).toBe(false)
    expect(canAccess(inactive, 'discipler')).toBe(false)
  })
})

describe('copy helpers', () => {
  it('explains every no-access reason without blaming the user', () => {
    for (const reason of [
      'no-profile',
      'no-member-link',
      'no-disciples',
      'inactive',
    ] as const) {
      const msg = noAccessMessage(reason)
      expect(msg.length).toBeGreaterThan(20)
      expect(msg).not.toMatch(/fail|error|denied|invalid/i)
    }
  })

  it('names a deactivated account in the heading and the next step in the body', () => {
    expect(noAccessHeading('inactive', 'Test Person')).toBe('Account deactivated')
    expect(noAccessMessage('inactive')).toBe('Contact a church admin.')
  })

  it('greets by first name for every other reason', () => {
    expect(noAccessHeading('no-disciples', 'Test Person')).toBe('Almost there, Test')
    expect(noAccessHeading('no-profile', '')).toBe('Almost there')
  })

  it('translates terse Supabase errors', () => {
    expect(friendlySignInError('Invalid login credentials')).toBe(
      'Email address or password incorrect.',
    )
    expect(friendlySignInError('Failed to fetch')).toMatch(/connection/i)
    expect(friendlySignInError('Something else entirely')).toBe('Something else entirely')
  })
})
