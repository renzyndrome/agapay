import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { checklistPct } from '#/lib/derive'
import { engagement } from '#/lib/engagement'
import { daysAgoLabel } from '#/lib/format'
import { STAGES } from '#/lib/stages'
import { useStore } from '#/store'
import { Card, ProgressBar, StageBadge, StatusDot } from '#/components/ui'

export const Route = createFileRoute('/admin/disciples')({
  component: AdminDisciples,
})

const COHORTS = ['Q1 2026', 'Q2 2026', '2025 Batch 2']
const ENG_FILTERS = [
  ['green', 'Healthy'],
  ['amber', 'Cooling'],
  ['red', 'At-risk'],
] as const

const filterSelectClass =
  'h-10 rounded-(--radius-input) border-[1.5px] border-cream-border bg-white px-2.5 text-[12.5px] font-semibold text-ink'

function AdminDisciples() {
  const { disciples, disciplers, reassignDisciples } = useStore()
  const [search, setSearch] = useState('')
  const [fStage, setFStage] = useState('all')
  const [fEng, setFEng] = useState('all')
  const [fDisc, setFDisc] = useState('all')
  const [fCohort, setFCohort] = useState('all')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [reassignTo, setReassignTo] = useState(disciplers[0]?.id ?? '')

  const q = search.trim().toLowerCase()
  const rows = disciples.filter(
    (d) =>
      (fStage === 'all' || d.stage === fStage) &&
      (fEng === 'all' || engagement(d.days).key === fEng) &&
      (fDisc === 'all' || d.disciplerId === fDisc) &&
      (fCohort === 'all' || d.cohort === fCohort) &&
      (!q || d.name.toLowerCase().includes(q)),
  )
  const selectedIds = Object.keys(selected).filter((id) => selected[id])

  const applyReassign = () => {
    reassignDisciples(selectedIds, reassignTo)
    setSelected({})
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
          <option value="all">All disciplers</option>
          {disciplers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
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
          <span className="text-[12.5px] font-bold text-white">
            {selectedIds.length} selected
          </span>
          <span className="ml-auto text-[12px] font-semibold text-white/60">
            Reassign to
          </span>
          <select
            value={reassignTo}
            onChange={(e) => setReassignTo(e.target.value)}
            className="h-9 rounded-[10px] border-none bg-white/12 px-2.5 text-[12px] font-semibold text-white"
          >
            {disciplers.map((x) => (
              <option key={x.id} value={x.id} className="text-ink">
                {x.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={applyReassign}
            className="press flex h-9 cursor-pointer items-center rounded-full bg-brand px-4 text-[12px] font-bold text-white hover:bg-brand-press"
          >
            Apply
          </button>
        </div>
      )}

      {/* table */}
      <Card className="mt-3.5 overflow-x-auto">
        <div className="min-w-[760px]">
          <div
            className="grid grid-cols-[36px_1.5fr_1fr_1fr_.9fr_.9fr_.9fr] gap-2 border-b border-cream-surface px-4.5 py-3 text-[9.5px] font-bold uppercase text-ink/40"
            style={{ letterSpacing: '.08em' }}
          >
            <span />
            <span>Name</span>
            <span>Stage</span>
            <span>Discipler</span>
            <span>Engagement</span>
            <span>Last activity</span>
            <span>Checklist</span>
          </div>
          {rows.length === 0 ? (
            <div className="px-4.5 py-6 text-center text-[12px] font-medium text-ink/50">
              No disciples match these filters.
            </div>
          ) : (
            rows.map((d) => {
              const e = engagement(d.days)
              const pct = checklistPct(d)
              const discipler = disciplers.find((x) => x.id === d.disciplerId)
              const isSelected = !!selected[d.id]
              return (
                <div
                  key={d.id}
                  className="grid grid-cols-[36px_1.5fr_1fr_1fr_.9fr_.9fr_.9fr] items-center gap-2 border-b border-cream-surface px-4.5 py-[11px] last:border-b-0"
                  style={{
                    background: isSelected ? 'var(--color-rose)' : 'var(--color-white)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() =>
                      setSelected((prev) => ({ ...prev, [d.id]: !prev[d.id] }))
                    }
                    className="h-4 w-4 cursor-pointer accent-(--color-brand)"
                  />
                  <span className="truncate font-display text-[13px] font-bold text-ink">
                    {d.name}
                  </span>
                  <span>
                    <StageBadge stage={d.stage} small />
                  </span>
                  <span className="truncate text-[12px] font-semibold text-ink/65">
                    {discipler?.name ?? '—'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusDot color={e.dot} />
                    <span className="text-[11.5px] font-semibold text-ink/60">
                      {e.label}
                    </span>
                  </span>
                  <span className="text-[12px] font-semibold text-ink/60">
                    {daysAgoLabel(d.days)}
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
    </div>
  )
}
