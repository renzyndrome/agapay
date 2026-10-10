import { useId, useMemo, useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { STAGES } from '#/lib/stages'
import type { Stage } from '#/lib/stages'
import {
  EMPTY_CIRCLE_DRAFT,
  circleListStatus,
  circlesRunBy,
  hasPendingCircleName,
  resolveCircleChoice,
  withStarted,
} from '#/lib/circleChoice'
import type { CircleDraft } from '#/lib/circleChoice'
import { searchByName, suggestMembers } from '#/lib/memberMatch'
import type { SuggestionReason } from '#/lib/memberMatch'
import { useStore } from '#/store'
import { useDisciples } from '#/features/disciples/hooks'
import {
  useDirectorySearchPool,
  useLifeGroups,
  useMyMemberId,
} from '#/features/directory/hooks'
import {
  useAddNewDisciple,
  useCreateCircle,
  useLinkDisciple,
} from '#/features/mutations'
import { CirclePicker } from '#/components/circle-picker'
import type { DirectoryEntry, LifeGroupSummary } from '#/features/types'
import {
  AvatarDisc,
  BottomSheet,
  FieldLabel,
  LoadError,
  Overlay,
  SelectorChip,
  SkeletonRows,
  StageBadge,
} from '#/components/ui'

// 16px text: smaller input text makes iOS Safari zoom the page on focus.
const fieldClass =
  'h-11 w-full rounded-(--radius-input) border-[1.5px] border-cream-border bg-cream px-3 text-[16px] font-semibold text-ink outline-none focus:border-brand'

const primaryClass =
  'press mt-3.5 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white shadow-(--shadow-glow) hover:bg-brand-press disabled:cursor-not-allowed disabled:bg-ink-300 disabled:shadow-none'

const REASON_LABELS: Record<SuggestionReason, string> = {
  initials: 'Same initials',
  surname: 'Same surname',
  similar: 'Similar name',
}

// Fewer plain matches than this: suggestions appear below them.
const SUGGEST_BELOW = 3
// Similar-name warning before adding someone new: suggestion score floor.
const DUPLICATE_SCORE = 0.5

function firstName(name: string | null): string {
  return name?.split(' ')[0] ?? ''
}

interface MemberRowProps {
  entry: DirectoryEntry
  myMemberId: string | null
  /** member ids already in this discipler's Agapay list */
  enrolledIds: ReadonlySet<string>
  reasons?: Array<SuggestionReason>
  /** this row's add is in flight */
  busy: boolean
  /** Add is off: a Quest Circle choice holds it, or another add is in flight */
  blocked: boolean
  /** id of the hint explaining a held add */
  describedBy?: string
  onAdd: () => void
}

function MemberRow({
  entry,
  myMemberId,
  enrolledIds,
  reasons,
  busy,
  blocked,
  describedBy,
  onAdd,
}: MemberRowProps) {
  const assignedToMe =
    entry.disciplerId !== null && entry.disciplerId === myMemberId
  // Assigned in the church directory but not yet in Agapay: Add finishes it.
  const mine = assignedToMe && enrolledIds.has(entry.id)
  const taken = entry.disciplerId !== null && !assignedToMe
  const status = mine
    ? 'Already a disciple'
    : assignedToMe
      ? 'Assigned, not added yet'
      : taken
        ? `Walks with ${firstName(entry.disciplerName) || 'another discipler'}`
        : 'No discipler yet'
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-cream px-3 py-2.5">
      <AvatarDisc name={entry.name} stage={entry.stage} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-display text-[13.5px] font-bold text-ink">
            {entry.name}
          </span>
          <StageBadge stage={entry.stage} small />
        </div>
        <div className="mt-0.5 truncate text-[11px] font-semibold text-ink/55">
          {[status, entry.satelliteName].filter(Boolean).join(' · ')}
        </div>
        {reasons && reasons.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {reasons.map((r) => (
              <span
                key={r}
                className="rounded-full bg-white px-2 py-[2px] text-[9.5px] font-bold uppercase text-ink/60"
                style={{ letterSpacing: '.05em' }}
              >
                {REASON_LABELS[r]}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {mine ? (
        <Check
          size={18}
          strokeWidth={2.4}
          className="flex-none text-green"
          aria-label="Already a disciple"
        />
      ) : taken ? null : (
        <button
          type="button"
          disabled={busy || blocked}
          aria-describedby={describedBy}
          onClick={onAdd}
          className="press flex h-11 flex-none cursor-pointer items-center rounded-full bg-brand px-4 text-[12.5px] font-bold text-white hover:bg-brand-press disabled:cursor-not-allowed disabled:bg-ink-300"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
      )}
    </div>
  )
}

/** Discipler: find a person in the church directory and take them on, or add
 *  a new believer when nobody fits. Search comes first so the same person is
 *  never recorded twice. */
export function AddDiscipleSheet() {
  const { closeSheet, showToast } = useStore()
  const { data: pool, isLoading, error } = useDirectorySearchPool()
  const myMemberId = useMyMemberId()
  const { data: myDisciples, isLoading: myDisciplesLoading } =
    useDisciples('mine')
  const linkDisciple = useLinkDisciple()
  const addNewDisciple = useAddNewDisciple()
  const createCircle = useCreateCircle()
  const {
    data: lifeGroups,
    isLoading: circlesLoading,
    error: circlesError,
    refetch: refetchCircles,
  } = useLifeGroups()

  const [mode, setMode] = useState<'search' | 'new'>('search')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newStage, setNewStage] = useState<Stage>('New Believer')
  const [showDuplicates, setShowDuplicates] = useState(false)
  // undefined = untouched: one circle is picked for the leader, two or more
  // must be chosen (see resolveCircleChoice)
  const [circlePick, setCirclePick] = useState<string | null | undefined>()
  // Circles started here: kept until the refetched list shows them.
  const [started, setStarted] = useState<Array<LifeGroupSummary>>([])
  // The "New circle" field lives here, not in the picker: it survives the
  // switch between search and new-believer mode.
  const [circleDraft, setCircleDraft] =
    useState<CircleDraft>(EMPTY_CIRCLE_DRAFT)
  const circleHintId = useId()

  const myCircles = useMemo(
    () => withStarted(circlesRunBy(lifeGroups, myMemberId), started),
    [lifeGroups, myMemberId, started],
  )
  const circleChoice = resolveCircleChoice(myCircles, circlePick)
  const circleId = circleChoice.value ?? null
  // While the list is loading or failed, a leader's circles are unknown:
  // adding is held, as when a choice is still needed.
  const circleStatus = circleListStatus(circlesLoading, circlesError)
  // A typed, unstarted circle name also holds adding: it is never dropped.
  const circleBlocked =
    circleChoice.needsChoice ||
    circleStatus !== 'ready' ||
    hasPendingCircleName(circleDraft)
  const circleHint = circleBlocked ? circleHintId : undefined
  // One add or link at a time: a second request could duplicate the first.
  const inFlight = busyId !== null
  const addOff = circleBlocked || inFlight
  const startCircle = async (name: string) => {
    const id = await createCircle(name)
    if (id) {
      setStarted((prev) => [
        ...prev,
        {
          id,
          name: name.trim(),
          satellite: '',
          leaderDisciplerId: myMemberId,
          coLeaderId: null,
        },
      ])
    }
    return id
  }
  const circlePicker = (
    <CirclePicker
      circles={myCircles}
      value={circleChoice.value}
      needsChoice={circleChoice.needsChoice}
      onChange={setCirclePick}
      onCreate={startCircle}
      draft={circleDraft}
      onDraftChange={setCircleDraft}
      hintId={circleHintId}
      listStatus={circleStatus}
      onRetry={refetchCircles}
    />
  )

  // Until the list loads, nothing assigned is offered for adding.
  const enrolledIds = useMemo(
    () =>
      myDisciplesLoading
        ? new Set(pool.map((m) => m.id))
        : new Set(myDisciples.map((d) => d.memberId ?? d.id)),
    [myDisciplesLoading, myDisciples, pool],
  )
  const others = useMemo(
    () => pool.filter((m) => m.id !== myMemberId),
    [pool, myMemberId],
  )
  const q = query.trim()
  const results = useMemo(() => searchByName(q, others, 8), [q, others])
  const suggestions = useMemo(
    () =>
      results.length >= SUGGEST_BELOW
        ? []
        : suggestMembers(q, others, new Set(results.map((r) => r.id))),
    [q, others, results],
  )
  const duplicates = useMemo(() => {
    const name = newName.trim()
    if (name.length < 2) return []
    const plain = searchByName(name, others, 5)
    const similar = suggestMembers(
      name,
      others,
      new Set(plain.map((m) => m.id)),
      5,
    )
      .filter((s) => s.score >= DUPLICATE_SCORE)
      .map((s) => s.member)
    return [...plain, ...similar]
  }, [newName, others])

  const link = async (entry: DirectoryEntry) => {
    if (addOff) return
    setBusyId(entry.id)
    try {
      await linkDisciple({ id: entry.id, name: entry.name }, circleId)
    } catch {
      showToast('Disciple not added. Retry.')
    } finally {
      setBusyId(null)
    }
  }

  const submitNew = async () => {
    if (addOff) return
    if (duplicates.length > 0 && !showDuplicates) {
      setShowDuplicates(true)
      return
    }
    setBusyId('new')
    try {
      await addNewDisciple(newName, newStage, circleId)
    } catch {
      showToast('Disciple not added. Retry.')
    } finally {
      setBusyId(null)
    }
  }

  if (mode === 'new') {
    return (
      <Overlay onClose={closeSheet} dismissDisabled={inFlight}>
        <BottomSheet>
          <button
            type="button"
            onClick={() => {
              setMode('search')
              setShowDuplicates(false)
            }}
            className="press -ml-1 mb-1 flex h-10 cursor-pointer items-center gap-1 text-[12px] font-bold text-ink/60"
          >
            <ArrowLeft size={15} strokeWidth={2.4} /> Back to search
          </button>
          <div className="font-display text-[16px] font-bold text-ink">
            New believer
          </div>
          <div className="mt-0.5 text-[12px] font-medium text-ink/55">
            Not in the church directory yet.
          </div>
          <div className="mt-3.5">
            <FieldLabel>Full name</FieldLabel>
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                setShowDuplicates(false)
              }}
              placeholder="First and last name"
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              className={fieldClass}
            />
          </div>
          <div className="mt-3">
            <FieldLabel>Stage</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <SelectorChip
                  key={s}
                  selected={newStage === s}
                  onClick={() => setNewStage(s)}
                >
                  {s}
                </SelectorChip>
              ))}
            </div>
          </div>
          {circlePicker}
          {showDuplicates ? (
            <div className="mt-3.5 flex flex-col gap-2">
              <div className="text-[12px] font-bold text-maroon">
                Similar names in the directory.
              </div>
              {duplicates.map((m) => (
                <MemberRow
                  key={m.id}
                  entry={m}
                  myMemberId={myMemberId}
                  enrolledIds={enrolledIds}
                  busy={busyId === m.id}
                  blocked={addOff}
                  describedBy={circleHint}
                  onAdd={() => void link(m)}
                />
              ))}
            </div>
          ) : null}
          <button
            type="button"
            disabled={newName.trim().length < 2 || addOff}
            aria-describedby={circleHint}
            onClick={() => void submitNew()}
            className={primaryClass}
          >
            {busyId === 'new'
              ? 'Adding…'
              : showDuplicates
                ? 'Add anyway'
                : 'Add new believer'}
          </button>
        </BottomSheet>
      </Overlay>
    )
  }

  return (
    <Overlay onClose={closeSheet} dismissDisabled={inFlight}>
      <BottomSheet>
        <div className="font-display text-[16px] font-bold text-ink">
          Add a disciple
        </div>
        <div className="mt-0.5 text-[12px] font-medium text-ink/55">
          Search the church directory first.
        </div>
        {circlePicker}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, nickname or initials"
          aria-label="Search the church directory"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className={`${fieldClass} mt-3.5`}
        />

        {error ? (
          <div className="mt-3">
            <LoadError message="Directory not available right now. Try again in a moment." />
          </div>
        ) : null}
        {isLoading ? (
          <div className="mt-3">
            <SkeletonRows rows={3} height={56} />
          </div>
        ) : null}

        {!isLoading && !error && q.length < 2 ? (
          <div className="mt-3 text-[12px] font-medium text-ink/45">
            Type 2 or more letters. Nicknames and initials work too.
          </div>
        ) : null}

        {!isLoading && !error && q.length >= 2 ? (
          <div className="mt-3 flex flex-col gap-2">
            {results.length > 0 ? (
              <div className="section-label">In the directory</div>
            ) : (
              <div className="text-[12px] font-medium text-ink/50">
                No exact name match.
              </div>
            )}
            {results.map((m) => (
              <MemberRow
                key={m.id}
                entry={m}
                myMemberId={myMemberId}
                enrolledIds={enrolledIds}
                busy={busyId === m.id}
                blocked={addOff}
                describedBy={circleHint}
                onAdd={() => void link(m)}
              />
            ))}
            {suggestions.length > 0 ? (
              <div className="section-label mt-1">Suggested</div>
            ) : null}
            {suggestions.map((s) => (
              <MemberRow
                key={s.member.id}
                entry={s.member}
                myMemberId={myMemberId}
                enrolledIds={enrolledIds}
                reasons={s.reasons}
                busy={busyId === s.member.id}
                blocked={addOff}
                describedBy={circleHint}
                onAdd={() => void link(s.member)}
              />
            ))}
            <div className="mt-1 flex items-center justify-between gap-3 rounded-[14px] border-[1.5px] border-dashed border-cream-border px-3 py-2.5">
              <span className="text-[12px] font-semibold text-ink/55">
                Not in the directory.
              </span>
              <button
                type="button"
                onClick={() => {
                  setNewName(q)
                  setShowDuplicates(false)
                  setMode('new')
                }}
                className="press flex h-11 flex-none cursor-pointer items-center rounded-full border-[1.5px] border-cream-border bg-white px-4 text-[12.5px] font-bold text-ink"
              >
                Add new believer
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </Overlay>
  )
}
