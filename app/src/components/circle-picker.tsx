import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { LifeGroupSummary } from '#/features/types'
import { EMPTY_CIRCLE_DRAFT, circleHoldHint } from '#/lib/circleChoice'
import type { CircleDraft, CircleListStatus } from '#/lib/circleChoice'
import { FieldLabel, SelectorChip } from '#/components/ui'

// 16px text: smaller input text makes iOS Safari zoom the page on focus.
const inputClass =
  'h-11 min-w-0 flex-1 rounded-(--radius-input) border-[1.5px] border-cream-border bg-cream px-3 text-[16px] font-semibold text-ink outline-none focus:border-brand'

const hintClass = 'mt-1.5 text-[11.5px] font-bold text-maroon'

interface CirclePickerProps {
  /** circles the discipler leads or co-leads */
  circles: ReadonlyArray<LifeGroupSummary>
  /** chosen circle id; null = no circle; undefined = not chosen yet */
  value: string | null | undefined
  /** two or more circles and none chosen yet */
  needsChoice: boolean
  onChange: (circleId: string | null) => void
  /** starts a circle; resolves its id, or null when refused */
  onCreate: (name: string) => Promise<string | null>
  /** the "New circle" field, held by the parent so it survives a remount
   *  and so a typed, unstarted name can hold the add */
  draft: CircleDraft
  onDraftChange: (draft: CircleDraft) => void
  /** id for the hint that explains a held add (aria-describedby target) */
  hintId?: string
  /** until 'ready' the chips are hidden: an unknown list offers no choice */
  listStatus?: CircleListStatus
  /** re-runs the circle list load after an error */
  onRetry?: () => void
}

/** Which of the discipler's Quest Circles a new disciple joins, with a way
 *  to start a new one on the spot. A leader with two or more circles must
 *  choose before adding. */
export function CirclePicker({
  circles,
  value,
  needsChoice,
  onChange,
  onCreate,
  draft,
  onDraftChange,
  hintId,
  listStatus = 'ready',
  onRetry,
}: CirclePickerProps) {
  const [busy, setBusy] = useState(false)
  // Focus the name field only when it is opened here, not on a remount.
  const [focusName, setFocusName] = useState(false)
  const { creating, name } = draft

  const create = async () => {
    setBusy(true)
    let id: string | null = null
    try {
      id = await onCreate(name)
    } finally {
      setBusy(false)
    }
    if (id) {
      onChange(id)
      onDraftChange(EMPTY_CIRCLE_DRAFT)
    }
  }

  const toggleCreating = () => {
    if (creating) {
      // Closing the field discards the typed name.
      onDraftChange(EMPTY_CIRCLE_DRAFT)
      return
    }
    setFocusName(true)
    onDraftChange({ creating: true, name: '' })
  }

  if (listStatus !== 'ready') {
    return (
      <div className="mt-3">
        <FieldLabel>Quest Circle</FieldLabel>
        {listStatus === 'loading' ? (
          <div id={hintId} className="text-[11.5px] font-semibold text-ink/45">
            Loading Quest Circles…
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              id={hintId}
              role="alert"
              className="text-[11.5px] font-bold text-maroon"
            >
              Quest Circles not loaded.
            </span>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="press flex h-9 flex-none cursor-pointer items-center rounded-full border-[1.5px] border-cream-border bg-white px-3.5 text-[12px] font-bold text-ink"
              >
                Retry
              </button>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  const hint = circleHoldHint(needsChoice, draft)

  return (
    <div className="mt-3">
      <FieldLabel>Quest Circle</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {circles.map((c) => (
          <SelectorChip
            key={c.id}
            selected={value === c.id}
            onClick={() => onChange(c.id)}
          >
            {c.name}
          </SelectorChip>
        ))}
        <SelectorChip selected={value === null} onClick={() => onChange(null)}>
          No circle
        </SelectorChip>
        {/* Opens the name field; not a choice itself, so it is never shown
            selected next to the circle the disciple joins. */}
        <button
          type="button"
          aria-expanded={creating}
          onClick={toggleCreating}
          className="press cursor-pointer rounded-full bg-white px-3.5 py-2.5 text-[11.5px] font-bold"
          style={{
            color: creating ? 'var(--color-brand)' : 'var(--color-ink-700)',
            border: `1.5px ${creating ? 'dashed var(--color-brand)' : 'solid var(--color-cream-border)'}`,
          }}
        >
          <span className="flex items-center gap-1">
            <Plus size={13} strokeWidth={2.6} /> New circle
          </span>
        </button>
      </div>
      {creating ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) =>
              onDraftChange({ creating: true, name: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim().length >= 2 && !busy) {
                e.preventDefault()
                void create()
              }
            }}
            placeholder="Quest Circle name"
            aria-label="New Quest Circle name"
            maxLength={60}
            autoFocus={focusName}
            autoComplete="off"
            enterKeyHint="done"
            className={inputClass}
          />
          <button
            type="button"
            disabled={name.trim().length < 2 || busy}
            onClick={() => void create()}
            className="press flex h-11 flex-none cursor-pointer items-center rounded-full bg-brand px-4 text-[12.5px] font-bold text-white hover:bg-brand-press disabled:cursor-not-allowed disabled:bg-ink-300"
          >
            {busy ? 'Starting…' : 'Start circle'}
          </button>
        </div>
      ) : null}
      {hint ? (
        <div id={hintId} className={hintClass}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}
