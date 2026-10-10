// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useInFlight } from '#/lib/useInFlight'

function deferred() {
  let resolve = () => {}
  let reject = (_reason: unknown) => {}
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useInFlight', () => {
  it('runs once while in flight and ignores repeat taps', async () => {
    const { result } = renderHook(() => useInFlight())
    const gate = deferred()
    let calls = 0
    const task = () => {
      calls += 1
      return gate.promise
    }

    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current[1](task)
      void result.current[1](task)
    })
    expect(result.current[0]).toBe(true)
    expect(calls).toBe(1)

    await act(async () => {
      gate.resolve()
      await first
    })
    expect(result.current[0]).toBe(false)

    await act(async () => {
      await result.current[1](() => Promise.resolve())
    })
    expect(calls).toBe(1)
  })

  it('resets after a failed run so the button works again', async () => {
    const { result } = renderHook(() => useInFlight())
    await act(async () => {
      await expect(
        result.current[1](() => Promise.reject(new Error('offline'))),
      ).rejects.toThrow('offline')
    })
    expect(result.current[0]).toBe(false)

    let ran = false
    await act(async () => {
      await result.current[1](async () => {
        ran = true
      })
    })
    expect(ran).toBe(true)
  })
})
