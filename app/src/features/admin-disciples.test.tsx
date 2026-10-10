// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { routeTree } from '#/routeTree.gen'

/** Demo mode regardless of any local .env (see mutations.test.tsx). */
vi.mock('#/lib/supabase', () => ({
  isDemoMode: true,
  hasSupabaseEnv: false,
  getSupabase: () => null,
}))

// The router restores scroll on navigation; jsdom has no scrolling.
beforeAll(() => {
  window.scrollTo = vi.fn()
})
afterEach(cleanup)

async function openAt(url: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByLabelText('Select page')
  return router
}

function rowBoxes(): Array<HTMLInputElement> {
  return screen
    .getAllByRole('checkbox')
    .filter((el) => el.getAttribute('aria-label') !== 'Select page')
    .map((el) => el as HTMLInputElement)
}

function reassignSelect(): HTMLSelectElement {
  return screen.getByLabelText('Reassign to')
}

/** A discipler option that runs at most one Quest Circle, so Apply needs no
 *  circle choice. */
function pickTarget(): string {
  const options = Array.from(reassignSelect().options).filter(
    (o) => o.value && !o.disabled,
  )
  for (const option of options) {
    fireEvent.change(reassignSelect(), { target: { value: option.value } })
    if (!screen.queryByText('Choose Quest Circle')) return option.text
  }
  throw new Error('no discipler without a circle choice')
}

describe('admin Disciples bulk reassign (demo)', () => {
  it('starts on the placeholder and keeps Apply off until a discipler is chosen', async () => {
    await openAt('/admin/disciples')
    fireEvent.click(rowBoxes()[0])

    expect(screen.getByText('1 selected')).toBeTruthy()
    expect(reassignSelect().value).toBe('')
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' }).disabled,
    ).toBe(true)

    pickTarget()
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' }).disabled,
    ).toBe(false)
  })

  it('moves nobody until Confirm move, then clears the selection', async () => {
    await openAt('/admin/disciples')
    fireEvent.click(rowBoxes()[0])
    fireEvent.click(rowBoxes()[1])
    const name = pickTarget()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByText(`Move 2 disciples to ${name}.`)).toBeTruthy()
    expect(screen.queryByText(/reassigned/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('2 selected')).toBeTruthy()
    expect(screen.queryByText(/reassigned/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }))

    expect(await screen.findByText(/^2 disciples reassigned/)).toBeTruthy()
    expect(screen.queryByText('2 selected')).toBeNull()
    expect(rowBoxes().every((box) => !box.checked)).toBe(true)
  })

  it('drops ticks a search hides, for good', async () => {
    await openAt('/admin/disciples')
    const firstRowName = rowBoxes()[0]
      .getAttribute('aria-label')!
      .replace(/^Select /, '')
    fireEvent.click(rowBoxes()[0])
    expect(screen.getByText('1 selected')).toBeTruthy()

    const searchBox = screen.getByPlaceholderText('Search name…')
    fireEvent.change(searchBox, { target: { value: 'zzz-no-match' } })
    expect(screen.queryByText('1 selected')).toBeNull()

    fireEvent.change(searchBox, { target: { value: '' } })
    expect(screen.queryByText('1 selected')).toBeNull()
    expect(
      screen.getByLabelText<HTMLInputElement>(`Select ${firstRowName}`).checked,
    ).toBe(false)
  })

  it('Select page ticks and unticks the rows of the current page', async () => {
    await openAt('/admin/disciples')
    const pageSize = rowBoxes().length
    const selectPage = screen.getByLabelText('Select page')

    fireEvent.click(selectPage)
    expect(screen.getByText(`${pageSize} selected`)).toBeTruthy()

    fireEvent.click(selectPage)
    expect(screen.queryByText(`${pageSize} selected`)).toBeNull()
  })

  it('keeps ticks on another page of the same filtered list', async () => {
    await openAt('/admin/disciples')
    fireEvent.click(rowBoxes()[0])
    const next = screen.queryByRole('button', { name: 'Next' })
    if (!next) return // the seed fits on one page
    fireEvent.click(next)
    fireEvent.click(rowBoxes()[0])
    expect(screen.getByText('2 selected')).toBeTruthy()
  })
})

describe('admin Disciples "No discipler" filter (demo)', () => {
  it('?discipler=none preselects the filter', async () => {
    const router = await openAt('/admin/disciples?discipler=none')
    expect(screen.getByDisplayValue('No discipler')).toBeTruthy()
    // every seeded disciple has a discipler
    expect(screen.getByText('No disciples match these filters.')).toBeTruthy()
    expect(router.state.location.search).toEqual({ discipler: 'none' })
  })

  it('choosing All disciplers clears the search param', async () => {
    const router = await openAt('/admin/disciples?discipler=none')
    const select = screen.getByDisplayValue('No discipler')
    fireEvent.change(select, { target: { value: 'all' } })
    await screen.findByDisplayValue('All disciplers')
    expect(router.state.location.search).toEqual({})
    expect(
      within(document.body).getAllByRole('checkbox').length,
    ).toBeGreaterThan(1)
  })
})

describe('admin Disciples filters holding vanished values (demo)', () => {
  it('a discipler the list does not offer reads as All and leaves the URL', async () => {
    const router = await openAt('/admin/disciples?discipler=gone-discipler')
    expect(screen.getByDisplayValue('All disciplers')).toBeTruthy()
    expect(rowBoxes().length).toBeGreaterThan(0)
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })
})

describe('admin Disciples rows (keyboard)', () => {
  it('each row has a named checkbox and a button that opens the detail', async () => {
    await openAt('/admin/disciples')
    const firstName = rowBoxes()[0]
      .getAttribute('aria-label')!
      .replace(/^Select /, '')
    const open = screen.getByRole('button', { name: firstName })
    expect(open.tagName).toBe('BUTTON')
    expect(screen.queryAllByRole('button', { name: 'Close' })).toHaveLength(0)

    fireEvent.click(open)
    expect(
      await screen.findAllByRole('button', { name: 'Close' }),
    ).not.toHaveLength(0)
    expect(rowBoxes()[0].checked).toBe(false)
  })
})
