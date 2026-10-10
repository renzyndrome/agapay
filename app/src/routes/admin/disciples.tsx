import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { engagementFromKey } from '#/lib/engagement'
import { daysAgoLabel } from '#/lib/format'
import { STAGES } from '#/lib/stages'
import { reassignTargets } from '#/lib/reassignTargets'
import { paginate } from '#/lib/paginate'
import {
  circleListStatus,
  circlesRunBy,
  resolveCircleChoice,
} from '#/lib/circleChoice'
import {
  keepVisible,
  pageTickState,
  toggleOne,
  togglePage,
} from '#/lib/bulkSelection'
import {
  ALL_DISCIPLERS,
  NO_DISCIPLER,
  availableFilterValue,
  hasNoDiscipler,
  matchesDisciplerFilter,
  parseAdminDisciplesSearch,
} from '#/lib/disciplerFilter'
import { reassignConfirmText } from '#/lib/reassignOutcome'
import { isDemoMode } from '#/lib/supabase'
import { useStore } from '#/store'
import { useDisciples } from '#/features/disciples/hooks'
import {
  useDirectorySearchPool,
  useDisciplers,
  useLifeGroups,
} from '#/features/directory/hooks'
import { useReassignDisciples } from '#/features/mutations'
import { checklistPctOf } from '#/features/types'
import {
  Card,
  ProgressBar,
  SkeletonRows,
  StageBadge,
  StatusDot,
} from '#/components/ui'

export const Route = createFileRoute('/admin/disciples')({
  // ?discipler=none opens the table on disciples with no discipler.
  validateSearch: parseAdminDisciplesSearch,
  component: AdminDisciples,
})

const COHORTS = ['Q1 2026', 'Q2 2026', '2025 Batch 2']
const ENG_FILTERS = [
  ['green', 'Healthy'],
  ['amber', 'Cooling'],
  ['red', 'At-risk'],
] as const

// Rows per table page.
const PAGE_SIZE = 25
// <select> values for the reassign Quest Circle choice.
const CIRCLE_UNCHOSEN = ''
const CIRCLE_KEEP = '__keep'

const pagerButtonClass =
  'press flex h-9 cursor-pointer items-center rounded-full border-[1.5px] border-cream-border bg-white px-4 text-[12px] font-bold text-ink hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white'

const barGhostButtonClass =
  'press flex h-9 cursor-pointer items-center rounded-full border-[1.5px] border-white/25 px-3.5 text-[12px] font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'

const barPrimaryButtonClass =
  'press flex h-9 cursor-pointer items-center rounded-full bg-brand px-4 text-[12px] font-bold text-white hover:bg-brand-press disabled:cursor-not-allowed disabled:bg-ink-300'

const filterSelectClass =
  'h-10 rounded-(--radius-input) border-[1.5px] border-cream-border bg-white px-2.5 text-[12.5px] font-semibold text-ink'

function AdminDisciples() {
  const { openAdminDetail, showToast } = useStore()
  const reassignDisciples = useReassignDisciples()
  const { data: disciples, isLoading } = useDisciples('all')
  const {
    data: disciplers,
    isLoading: disciplersLoading,
    error: disciplersError,
  } = useDisciplers()
  const {
    data: lifeGroups,
    isLoading: lifeGroupsLoading,
    error: lifeGroupsError,
    refetch: refetchLifeGroups,
  } = useLifeGroups()
  const {
    data: directory,
    isLoading: directoryLoading,
    error: directoryError,
    refetch: refetchDirectory,
  } = useDirectorySearchPool()
  const { discipler: disciplerParam } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [search, setSearch] = useState('')
  const [fStage, setFStage] = useState('all')
  const [fEng, setFEng] = useState('all')
  const [fCircle, setFCircle] = useState('all')
  const [fCohort, setFCohort] = useState('all')
  const [reassignTo, setReassignTo] = useState('')
  const [confirmFor, setConfirmFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The discipler filter lives in the URL, so the dashboard can link
  // straight to the disciples with no discipler. A discipler the refetched
  // list no longer shows reads as "all" (and leaves the URL below).
  const fDisc = availableFilterValue(
    disciplerParam ?? ALL_DISCIPLERS,
    disciplers.map((x) => x.id),
    !disciplersLoading && !disciplersError,
    [ALL_DISCIPLERS, NO_DISCIPLER],
  )
  const setFDisc = (value: string) =>
    void navigate({
      search: (prev) => ({
        ...prev,
        discipler: value === ALL_DISCIPLERS ? undefined : value,
      }),
      replace: true,
      resetScroll: false,
    })
  const staleDiscParam =
    disciplerParam !== undefined && fDisc === ALL_DISCIPLERS
  useEffect(() => {
    if (!staleDiscParam) return
    void navigate({
      search: (prev) => ({ ...prev, discipler: undefined }),
      replace: true,
      resetScroll: false,
    })
  }, [staleDiscParam, navigate])
  // Same for a Quest Circle the refetched list no longer shows.
  const circleFilter = availableFilterValue(
    fCircle,
    lifeGroups.map((g) => g.id),
    !lifeGroupsLoading && !lifeGroupsError,
  )
  if (circleFilter !== fCircle) setFCircle(circleFilter)

  const q = search.trim().toLowerCase()
  const rows = disciples.filter(
    (d) =>
      (fStage === 'all' || d.stage === fStage) &&
      (fEng === 'all' || d.engagement === fEng) &&
      matchesDisciplerFilter(d.disciplerId, fDisc) &&
      (circleFilter === 'all' || d.lifeGroupId === circleFilter) &&
      (fCohort === 'all' || d.cohort === fCohort) &&
      (!q || d.name.toLowerCase().includes(q)),
  )

  // The page belongs to one set of filters: any filter change starts over at
  // the first page, with no effect needed.
  const filterKey = [search, fStage, fEng, fDisc, circleFilter, fCohort].join(
    '|',
  )
  const [pageState, setPageState] = useState({ key: filterKey, page: 0 })
  const win = paginate(
    rows.length,
    pageState.key === filterKey ? pageState.page : 0,
    PAGE_SIZE,
  )
  const pageRows = rows.slice(win.start, win.end)
  const pageIds = pageRows.map((d) => d.id)
  const goToPage = (page: number) => setPageState({ key: filterKey, page })

  // A tick counts only while its row is in the filtered list (on any page),
  // so a bulk move never reaches a row the admin cannot see.
  const [selection, setSelection] = useState<{
    key: string
    ids: Array<string>
  }>({ key: filterKey, ids: [] })
  const selectedIds = keepVisible(
    selection.ids,
    rows.map((d) => d.id),
  )
  if (selection.key !== filterKey) {
    // A filter or the search changed: the ticks it hid are dropped for good.
    setSelection({ key: filterKey, ids: selectedIds })
  }
  if (selectedIds.length === 0 && reassignTo !== '') {
    // Each new selection starts on the "Choose discipler" placeholder.
    setReassignTo('')
  }
  const setSelectedIds = (ids: Array<string>) =>
    setSelection({ key: filterKey, ids })
  const selectedSet = new Set(selectedIds)
  const pageTicks = pageTickState(selectedIds, pageIds)
  const selectedKey = selectedIds.join('|')

  // Live: any active member may become a discipler. Demo keeps the seeded
  // disciplers only, so the prototype behaves as before.
  const targets = useMemo(() => {
    const chosen = new Set(selectedKey.split('|'))
    const movingMemberIds = disciples
      .filter((d) => chosen.has(d.id))
      .map((d) => d.memberId ?? d.id)
    return reassignTargets({
      disciplers,
      members: isDemoMode ? [] : directory,
      movingMemberIds,
    })
  }, [disciples, disciplers, directory, selectedKey])
  // No discipler is preselected: the select shows its placeholder until a
  // pick is made, and again when the pick is no longer allowed.
  const targetOptions = [...targets.disciplers, ...targets.others]
  const target = targetOptions.some((x) => x.id === reassignTo)
    ? reassignTo
    : ''
  const targetName = targetOptions.find((x) => x.id === target)?.name ?? ''

  // Which of the new discipler's Quest Circles the moved disciples join. The
  // choice belongs to one target: picking another discipler starts over.
  const [circleState, setCircleState] = useState<{
    target: string
    pick: string | null | undefined
  }>({ target: '', pick: undefined })
  const targetCircles = circlesRunBy(lifeGroups, target || null)
  const circleChoice = resolveCircleChoice(
    targetCircles,
    circleState.target === target ? circleState.pick : undefined,
  )
  const circleSelectValue =
    circleChoice.value === undefined
      ? CIRCLE_UNCHOSEN
      : circleChoice.value === null
        ? CIRCLE_KEEP
        : circleChoice.value

  // The circle choice and the loop guard in reassignTargets both read these
  // lists: until both load, a move could skip a circle or close a loop.
  const lookupStatus = circleListStatus(
    lifeGroupsLoading || directoryLoading,
    lifeGroupsError ?? directoryError,
  )
  const retryLookups = () => {
    if (lifeGroupsError) refetchLifeGroups()
    if (directoryError) refetchDirectory()
  }

  const canApply =
    !busy &&
    lookupStatus === 'ready' &&
    !!target &&
    !circleChoice.needsChoice &&
    selectedIds.length > 0
  // The confirm belongs to one exact move: changing the selection, the
  // discipler or the circle closes it.
  const moveKey = [target, circleSelectValue, selectedKey].join('#')
  const confirming = confirmFor === moveKey && selectedIds.length > 0

  const confirmMove = async () => {
    if (!canApply) return
    setBusy(true)
    try {
      // The selection stays until the move resolves, and clears only when
      // every disciple moved.
      const moved = await reassignDisciples(
        selectedIds,
        target,
        circleChoice.value ?? null,
      )
      if (moved) setSelectedIds([])
    } catch {
      showToast('Reassign failed. Refresh and retry.')
    } finally {
      setBusy(false)
      setConfirmFor(null)
    }
  }

  return (
    <div className="max-w-265 px-8 pt-7 pb-10 max-md:px-5">
      <div className="font-display text-[24px] font-bold tracking-[-.01em] text-ink">
        Disciples
      </div>

      {/* filters */}
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name…"
          className="h-10 w-45 rounded-(--radius-input) border-[1.5px] border-cream-border bg-white px-3 text-[12.5px] font-semibold text-ink outline-none focus:border-brand"
        />
        <select
          value={fStage}
          onChange={(e) => setFStage(e.target.value)}
          className={filterSelectClass}
        >
          <option value="all">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={fEng}
          onChange={(e) => setFEng(e.target.value)}
          className={filterSelectClass}
        >
          <option value="all">All engagement</option>
          {ENG_FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={fDisc}
          onChange={(e) => setFDisc(e.target.value)}
          className={filterSelectClass}
        >
          <option value={ALL_DISCIPLERS}>All disciplers</option>
          <option value={NO_DISCIPLER}>No discipler</option>
          {disciplers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          value={circleFilter}
          onChange={(e) => setFCircle(e.target.value)}
          className={filterSelectClass}
        >
          <option value="all">All Quest Circles</option>
          {lifeGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          value={fCohort}
          onChange={(e) => setFCohort(e.target.value)}
          className={filterSelectClass}
        >
          <option value="all">All cohorts</option>
          {COHORTS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center gap-3 rounded-[14px] bg-ink px-4 py-2.5">
          {confirming ? (
            <>
              <span className="text-[12.5px] font-bold text-white">
                {reassignConfirmText(selectedIds.length, targetName)}
              </span>
              <button
                type="button"
                onClick={() => setConfirmFor(null)}
                disabled={busy}
                className={`ml-auto ${barGhostButtonClass}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmMove()}
                disabled={busy}
                className={barPrimaryButtonClass}
              >
                Confirm move
              </button>
            </>
          ) : (
            <>
              <span className="text-[12.5px] font-bold text-white">
                {selectedIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                disabled={busy}
                className={barGhostButtonClass}
              >
                Clear
              </button>
              <span className="ml-auto text-[12px] font-semibold text-white/60">
                Reassign to
              </span>
              <select
                value={target}
                onChange={(e) => setReassignTo(e.target.value)}
                aria-label="Reassign to"
                className="h-9 max-w-60 rounded-[10px] border-none bg-white/12 px-2.5 text-[12px] font-semibold text-white"
              >
                <option value="" disabled className="text-ink">
                  Choose discipler
                </option>
                {targets.others.length > 0 ? (
                  <>
                    <optgroup label="Disciplers" className="text-ink">
                      {targets.disciplers.map((x) => (
                        <option key={x.id} value={x.id} className="text-ink">
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Other members" className="text-ink">
                      {targets.others.map((x) => (
                        <option key={x.id} value={x.id} className="text-ink">
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  targets.disciplers.map((x) => (
                    <option key={x.id} value={x.id} className="text-ink">
                      {x.name}
                    </option>
                  ))
                )}
              </select>
              {targetCircles.length > 0 ? (
                <select
                  value={circleSelectValue}
                  onChange={(e) =>
                    setCircleState({
                      target,
                      pick:
                        e.target.value === CIRCLE_KEEP
                          ? null
                          : e.target.value || undefined,
                    })
                  }
                  aria-label="Quest Circle"
                  className="h-9 max-w-52 rounded-[10px] border-none bg-white/12 px-2.5 text-[12px] font-semibold text-white"
                >
                  {circleChoice.needsChoice ? (
                    <option
                      value={CIRCLE_UNCHOSEN}
                      disabled
                      className="text-ink"
                    >
                      Choose Quest Circle
                    </option>
                  ) : null}
                  {targetCircles.map((g) => (
                    <option key={g.id} value={g.id} className="text-ink">
                      {g.name}
                    </option>
                  ))}
                  <option value={CIRCLE_KEEP} className="text-ink">
                    No Quest Circle
                  </option>
                </select>
              ) : null}
              {lookupStatus === 'loading' ? (
                <span className="text-[12px] font-semibold text-white/60">
                  Loading directory…
                </span>
              ) : null}
              {lookupStatus === 'error' ? (
                <>
                  <span
                    role="alert"
                    className="text-[12px] font-bold text-white"
                  >
                    Directory not loaded.
                  </span>
                  <button
                    type="button"
                    onClick={retryLookups}
                    className={barGhostButtonClass}
                  >
                    Retry
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setConfirmFor(moveKey)}
                disabled={!canApply}
                className={barPrimaryButtonClass}
              >
                Apply
              </button>
            </>
          )}
        </div>
      )}

      {/* table */}
      <Card className="mt-3.5 overflow-x-auto">
        <div className="min-w-[880px]">
          <div
            className="grid grid-cols-[36px_1.5fr_.9fr_1fr_1fr_.9fr_.9fr_.9fr] items-center gap-2 border-b border-cream-surface px-4.5 py-3 text-[9.5px] font-bold uppercase text-ink/40"
            style={{ letterSpacing: '.08em' }}
          >
            <input
              type="checkbox"
              aria-label="Select page"
              checked={pageTicks === 'all'}
              ref={(el) => {
                if (el) el.indeterminate = pageTicks === 'some'
              }}
              disabled={busy || pageIds.length === 0}
              onChange={() => setSelectedIds(togglePage(selectedIds, pageIds))}
              className="h-4 w-4 cursor-pointer accent-(--color-brand) disabled:cursor-not-allowed"
            />
            <span>Name</span>
            <span>Stage</span>
            <span>Quest Circle</span>
            <span>Discipler</span>
            <span>Engagement</span>
            <span>Last activity</span>
            <span>Checklist</span>
          </div>
          {isLoading ? (
            <div className="p-4">
              <SkeletonRows rows={6} height={44} />
            </div>
          ) : null}
          {!isLoading && rows.length === 0 ? (
            <div className="px-4.5 py-6 text-center text-[12px] font-medium text-ink/50">
              No disciples match these filters.
            </div>
          ) : (
            pageRows.map((d) => {
              const e = engagementFromKey(d.engagement)
              const pct = checklistPctOf(d)
              const discipler = disciplers.find((x) => x.id === d.disciplerId)
              const group = lifeGroups.find((x) => x.id === d.lifeGroupId)
              const isSelected = selectedSet.has(d.id)
              return (
                <div
                  key={d.id}
                  onClick={() => openAdminDetail(d.id)}
                  className="grid cursor-pointer grid-cols-[36px_1.5fr_.9fr_1fr_1fr_.9fr_.9fr_.9fr] items-center gap-2 border-b border-cream-surface px-4.5 py-[11px] last:border-b-0 hover:bg-cream"
                  style={{
                    background: isSelected ? 'var(--color-rose)' : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${d.name}`}
                    checked={isSelected}
                    disabled={busy}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() =>
                      setSelectedIds(toggleOne(selectedIds, d.id))
                    }
                    className="h-4 w-4 cursor-pointer accent-(--color-brand) disabled:cursor-not-allowed"
                  />
                  {/* The keyboard way in: a real button opens the detail. */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      openAdminDetail(d.id)
                    }}
                    className="w-full min-w-0 cursor-pointer truncate text-left font-display text-[13px] font-bold text-ink"
                  >
                    {d.name}
                  </button>
                  <span>
                    <StageBadge stage={d.stage} small />
                  </span>
                  <span
                    className="truncate text-[11px] font-bold text-maroon"
                    style={{ letterSpacing: '.03em' }}
                  >
                    {group?.name ?? 'None'}
                  </span>
                  <span className="truncate text-[12px] font-semibold text-ink/65">
                    {hasNoDiscipler(d.disciplerId)
                      ? 'No discipler'
                      : (discipler?.name ?? 'Not set')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusDot color={e.dot} />
                    <span className="text-[11.5px] font-semibold text-ink/60">
                      {e.label}
                    </span>
                  </span>
                  <span className="text-[12px] font-semibold text-ink/60">
                    {d.days === null ? 'Never' : daysAgoLabel(d.days)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="flex-1">
                      <ProgressBar pct={pct} />
                    </span>
                    <span className="w-8 text-right text-[11px] font-bold text-ink/55">
                      {pct}%
                    </span>
                  </span>
                </div>
              )
            })
          )}
        </div>
      </Card>

      {!isLoading && rows.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12px] font-semibold text-ink/55">
            {win.start + 1}–{win.end} of {rows.length}
          </span>
          {win.pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={win.page === 0}
                onClick={() => goToPage(win.page - 1)}
                className={pagerButtonClass}
              >
                Previous
              </button>
              <span className="text-[12px] font-semibold text-ink/55">
                Page {win.page + 1} of {win.pageCount}
              </span>
              <button
                type="button"
                disabled={win.page >= win.pageCount - 1}
                onClick={() => goToPage(win.page + 1)}
                className={pagerButtonClass}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
