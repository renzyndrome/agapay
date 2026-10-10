import { useCallback, useRef, useState } from 'react'

/** One-shot guard for a confirm button: while a run is in flight, repeat
 *  taps are ignored and `busy` is true. The ref blocks a second tap that
 *  lands before React re-renders the disabled button. */
export function useInFlight(): [
  boolean,
  (task: () => Promise<unknown>) => Promise<void>,
] {
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async (task: () => Promise<unknown>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await task()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [])

  return [busy, run]
}
