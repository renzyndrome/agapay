// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '#/auth'
import { StoreProvider } from '#/store'
import { DEMO_UNASSIGNED } from '#/data/demo-directory'
import { AddDiscipleSheet } from '#/components/add-disciple-sheet'

/** Demo mode regardless of any local .env (see mutations.test.tsx). */
vi.mock('#/lib/supabase', () => ({
  isDemoMode: true,
  hasSupabaseEnv: false,
  getSupabase: () => null,
}))

afterEach(cleanup)

function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <StoreProvider>{children}</StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

const HINT = 'Start the circle or clear the name.'

function openSheetAndSearch() {
  render(
    <Providers>
      <AddDiscipleSheet />
    </Providers>,
  )
  fireEvent.change(screen.getByLabelText('Search the church directory'), {
    target: { value: DEMO_UNASSIGNED[0].name },
  })
}

function addButtons(): Array<HTMLButtonElement> {
  return screen.getAllByRole<HTMLButtonElement>('button', { name: 'Add' })
}

function typeCircleName(name: string) {
  fireEvent.change(screen.getByLabelText('New Quest Circle name'), {
    target: { value: name },
  })
}

describe('add sheet Quest Circle field (demo)', () => {
  it('holds every Add while a circle name is typed but not started', () => {
    openSheetAndSearch()
    expect(addButtons().every((b) => !b.disabled)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /New circle/ }))
    typeCircleName('Test Circle')

    const hint = screen.getByText(HINT)
    for (const button of addButtons()) {
      expect(button.disabled).toBe(true)
      expect(button.getAttribute('aria-describedby')).toBe(hint.id)
    }

    typeCircleName('')
    expect(screen.queryByText(HINT)).toBeNull()
    for (const button of addButtons()) {
      expect(button.disabled).toBe(false)
      expect(button.getAttribute('aria-describedby')).toBeNull()
    }
  })

  it('keeps the typed circle name across the switch to New believer', () => {
    openSheetAndSearch()
    fireEvent.click(screen.getByRole('button', { name: /New circle/ }))
    typeCircleName('Test Circle')

    fireEvent.click(screen.getByRole('button', { name: 'Add new believer' }))
    expect(screen.getByText('New believer')).toBeTruthy()
    expect(
      screen.getByLabelText<HTMLInputElement>('New Quest Circle name').value,
    ).toBe('Test Circle')
    expect(screen.getByText(HINT)).toBeTruthy()
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Add new believer',
      }).disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Back to search/ }))
    expect(
      screen.getByLabelText<HTMLInputElement>('New Quest Circle name').value,
    ).toBe('Test Circle')
  })

  it('shows one selected chip, and New circle never as a choice', () => {
    openSheetAndSearch()
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'No circle' }))
    const newCircle = screen.getByRole('button', { name: /New circle/ })
    fireEvent.click(newCircle)

    const pressed = screen.getAllByRole('button', { pressed: true })
    expect(pressed).toHaveLength(1)
    expect(pressed[0].textContent).toBe('No circle')
    expect(newCircle.getAttribute('aria-expanded')).toBe('true')
    expect(newCircle.hasAttribute('aria-pressed')).toBe(false)
  })

  it('closing the New circle field discards the typed name', () => {
    openSheetAndSearch()
    const newCircle = screen.getByRole('button', { name: /New circle/ })
    fireEvent.click(newCircle)
    typeCircleName('Test Circle')
    fireEvent.click(newCircle)

    expect(screen.queryByLabelText('New Quest Circle name')).toBeNull()
    expect(screen.queryByText(HINT)).toBeNull()
    expect(addButtons().every((b) => !b.disabled)).toBe(true)
  })
})
