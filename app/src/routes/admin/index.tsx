import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { Disciple } from '#/data/seed'
import { STAGE_TREND_HISTORY } from '#/data/seed'
import { checklistPct, upcomingThisWeek } from '#/lib/derive'
import { ENGAGEMENT, engagement } from '#/lib/engagement'
import {
  daysAgoLabel,
  fmtDow,
  fmtShort,
  fmtTime12,
  fromISODate,
  initials,
  today,
} from '#/lib/format'
import { STAGES, stageBar, stagePill } from '#/lib/stages'
import type { Stage } from '#/lib/stages'
import { useStore } from '#/store'
import { StageTrend } from '#/components/stage-trend'
import {
  AvatarDisc,
  Card,
  DateColumn,
  StageBadge,
  StatusDot,
} from '#/components/ui'

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

const COHORTS = ['Q1 2026', 'Q2 2026', '2025 Batch 2']

interface EngagementCounts {
  green: number
  amber: number
  red: number
  total: number
}

function countEngagement(pool: Array<Disciple>): EngagementCounts {
  const counts = { green: 0, amber: 0, red: 0, total: pool.length }
  for (const d of pool) counts[engagement(d.days).key] += 1
  return counts
}

function avgChecklist(pool: Array<Disciple>): number {
  if (pool.length === 0) return 0
  return Math.round(pool.reduce((sum, d) => sum + checklistPct(d), 0) / pool.length)
}

const ENGAGEMENT_SEGMENTS = [
  { key: 'green', label: 'Healthy', color: 'var(--color-green)' },
  { key: 'amber', label: 'Cooling', color: 'var(--color-amber)' },
  { key: 'red', label: 'At-risk', color: 'var(--color-brand)' },
] as const

/** Stacked engagement bar — 2px surface gaps between fills, tooltips per segment.
 *  Never color-alone: callers pair it with labeled counts (legend or chips). */
function EngagementStackedBar({
  counts,
  height = 12,
}: {
  counts: EngagementCounts
  height?: number
}) {
  if (counts.total === 0) {
    return (
      <div
        className="rounded-full bg-cream-surface"
        style={{ height }}
        title="No disciples"
      />
    )
  }
  return (
    <div className="flex w-full overflow-hidden rounded-full" style={{ gap: 2 }}>
      {ENGAGEMENT_SEGMENTS.map((seg) => {
        const value = counts[seg.key]
        if (value === 0) return null
        return (
          <div
            key={seg.key}
            className="rounded-full"
            title={`${seg.label}: ${value} of ${counts.total}`}
            style={{
              height,
              background: seg.color,
              flexGrow: value,
              flexBasis: 0,
              minWidth: 8,
            }}
          />
        )
      })}
    </div>
  )
}

interface StatTileProps {
  value: string
  label: string
  accent?: 'brand' | 'green'
  hint: string
}

function StatTile({ value, label, accent, hint }: StatTileProps) {
  const color =
    accent === 'brand'
      ? 'var(--color-brand)'
      : accent === 'green'
        ? 'var(--color-green)'
        : 'var(--color-ink)'
  return (
    <Card className="px-5 py-4">
      <div title={hint}>
        <div
          className="font-display text-[26px] leading-none font-extrabold"
          style={{ color }}
        >
          {value}
        </div>
        <div
          className="mt-1.5 text-[10px] font-bold uppercase text-ink/45"
          style={{ letterSpacing: '.08em' }}
        >
          {label}
        </div>
      </div>
    </Card>
  )
}

function CardTitle({
  children,
  right,
}: {
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3">
      <span className="font-display text-[14px] font-bold text-ink">{children}</span>
      {right ? (
        <span className="text-[11px] font-semibold text-ink/45">{right}</span>
      ) : null}
    </div>
  )
}

function AdminDashboard() {
  const { disciples, meetings, disciplers, lifeGroups, openAdminDetail } = useStore()
  const [cohort, setCohort] = useState('all')
  const [circle, setCircle] = useState('all')

  const cohortPool = disciples.filter((d) => cohort === 'all' || d.cohort === cohort)
  const pool = cohortPool.filter((d) => circle === 'all' || d.lifeGroupId === circle)
  const needsAttention = pool
    .filter((d) => d.days > ENGAGEMENT.amberAfterDays)
    .sort((a, b) => b.days - a.days)
  const week = upcomingThisWeek(meetings)
  const eng = countEngagement(pool)

  const currentStageCounts = Object.fromEntries(
    STAGES.map((s) => [s, disciples.filter((d) => d.stage === s).length]),
  ) as Record<Stage, number>
  const currentMonthLabel = fmtShort(today()).split(' ')[0] ?? ''

  const filterSelectClass =
    'h-[42px] rounded-(--radius-input) border-[1.5px] border-cream-border bg-white px-3 text-[12.5px] font-semibold text-ink'

  return (
    <div className="max-w-265 px-8 pt-7 pb-10 max-md:px-5">
      {/* title + filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-display text-[24px] font-bold tracking-[-.01em] text-ink">
            Dashboard
          </div>
          <div className="mt-0.5 text-[13px] font-medium text-ink/55">
            Quest Laguna Main · discipleship overview
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={circle}
            onChange={(e) => setCircle(e.target.value)}
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
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
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
      </div>

      {/* KPI tiles */}
      <div className="mt-5 grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
        <StatTile
          value={String(pool.length)}
          label="Disciples"
          hint="Disciples in the current filter"
        />
        <StatTile
          value={String(needsAttention.length)}
          label="Need attention"
          accent="brand"
          hint="Cooling + at-risk disciples"
        />
        <StatTile
          value={String(week.length)}
          label="Meetings this week"
          hint="Upcoming meetings in the next 7 days"
        />
        <StatTile
          value={`${avgChecklist(pool)}%`}
          label="Avg checklist"
          accent="green"
          hint="Average stage-checklist completion"
        />
      </div>

      {/* stage overview cards */}
      <div className="mt-3.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
        {STAGES.map((stage) => {
          const group = pool.filter((d) => d.stage === stage)
          const share = pool.length
            ? Math.round((100 * group.length) / pool.length)
            : 0
          const avg = avgChecklist(group)
          const pill = stagePill(stage)
          return (
            <Card
              key={stage}
              className="px-5 py-4.5"
              style={{ borderTop: `4px solid ${stageBar(stage)}` }}
            >
              <span
                className="rounded-full text-[9.5px] font-bold uppercase"
                style={{
                  background: pill.bg,
                  color: pill.fg,
                  letterSpacing: '.06em',
                  padding: '4px 10px',
                }}
              >
                {stage}
              </span>
              <div className="mt-2.5 flex items-baseline gap-2">
                <span className="font-display text-[34px] leading-none font-extrabold text-ink">
                  {group.length}
                </span>
                <span className="text-[12px] font-bold text-ink/45">
                  {share}% of disciples
                </span>
              </div>
              <div
                className="mt-3 overflow-hidden rounded-full bg-cream-surface"
                style={{ height: 6 }}
                title={`${stage}: ${group.length} of ${pool.length} disciples (${share}%)`}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${share}%`, background: stageBar(stage) }}
                />
              </div>
              <div className="mt-2 text-[11.5px] font-medium text-ink/50">
                avg checklist {avg}%
              </div>
            </Card>
          )
        })}
      </div>

      {/* stage trend + engagement health */}
      <div className="mt-3.5 grid grid-cols-[1.7fr_1fr] items-stretch gap-3.5 max-md:grid-cols-1">
        <Card>
          <CardTitle right={`${disciples.length} disciples today`}>
            Stage growth · last 6 months
          </CardTitle>
          <div className="px-5 pb-4">
            <StageTrend
              history={STAGE_TREND_HISTORY}
              current={currentStageCounts}
              currentMonthLabel={currentMonthLabel}
            />
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardTitle right={`${eng.total} disciples`}>Engagement health</CardTitle>
          <div className="px-5 pb-4">
            <EngagementStackedBar counts={eng} height={14} />
            <div className="mt-4 flex flex-col gap-2.5">
              {ENGAGEMENT_SEGMENTS.map((seg) => {
                const value = eng[seg.key]
                const share = eng.total ? Math.round((100 * value) / eng.total) : 0
                return (
                  <div key={seg.key} className="flex items-center gap-2">
                    <StatusDot color={seg.color} />
                    <span className="text-[12px] font-semibold text-ink-700">
                      {seg.label}
                    </span>
                    <span className="ml-auto text-[12px] font-bold text-ink">
                      {value}
                    </span>
                    <span className="w-9 text-right text-[11px] font-semibold text-ink/45">
                      {share}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="mt-auto border-t border-cream-surface px-5 py-3 text-[11.5px] leading-relaxed font-medium text-ink/50">
            Healthy ≤ {ENGAGEMENT.amberAfterDays} days since last activity · At-risk
            &gt; {ENGAGEMENT.redAfterDays} days
          </div>
        </Card>
      </div>

      {/* quest circles + this week */}
      <div className="mt-3.5 grid grid-cols-[1.7fr_1fr] items-stretch gap-3.5 max-md:grid-cols-1">
        <Card>
          <CardTitle right={`${lifeGroups.length} circles · Quest Laguna Main`}>
            Quest Circles
          </CardTitle>
          {lifeGroups.map((g) => {
            const members = cohortPool.filter((d) => d.lifeGroupId === g.id)
            const groupEng = countEngagement(members)
            const leader = disciplers.find((x) => x.id === g.leaderDisciplerId)
            return (
              <div key={g.id} className="border-t border-cream-surface px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-rose font-display text-[11px] font-bold text-maroon">
                    {initials(g.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate font-display text-[13px] font-bold text-ink"
                        style={{ letterSpacing: '.02em' }}
                      >
                        {g.name}
                      </span>
                      {groupEng.red > 0 && (
                        <span className="flex-none rounded-full bg-rose px-2 py-[3px] text-[9.5px] font-bold text-maroon">
                          {groupEng.red} at-risk
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-medium text-ink/50">
                      Led by {leader?.name ?? '—'} · {members.length} disciples · avg
                      checklist {avgChecklist(members)}%
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="flex-1">
                    <EngagementStackedBar counts={groupEng} height={10} />
                  </div>
                  <span className="flex-none text-[10.5px] font-semibold whitespace-nowrap text-ink/45">
                    {groupEng.green} healthy · {groupEng.amber} cooling ·{' '}
                    {groupEng.red} at-risk
                  </span>
                </div>
              </div>
            )
          })}
        </Card>

        <Card>
          <CardTitle right="next 7 days">This week</CardTitle>
          {week.length === 0 ? (
            <div className="border-t border-cream-surface px-5 py-5 text-center text-[12px] font-medium text-ink/50">
              No meetings scheduled this week.
            </div>
          ) : (
            week.map((m) => {
              const d = disciples.find((x) => x.id === m.discipleId)
              const discipler = disciplers.find((x) => x.id === d?.disciplerId)
              const date = fromISODate(m.dateISO)
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 border-t border-cream-surface px-5 py-3"
                >
                  <DateColumn dow={fmtDow(date)} day={String(date.getDate())} />
                  <div className="w-px self-stretch bg-cream-border" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[12.5px] font-bold text-ink">
                      {d?.name ?? ''}
                    </div>
                    <div className="truncate text-[11px] font-medium text-ink/50">
                      {fmtTime12(m.time)} · with {discipler?.name.split(' ')[0] ?? '—'}
                    </div>
                  </div>
                  <span className="flex-none rounded-full bg-cream-surface px-2 py-1 text-[9.5px] font-bold text-ink-700">
                    {m.mode === 'online' ? 'Online' : 'In-person'}
                  </span>
                </div>
              )
            })
          )}
        </Card>
      </div>

      {/* at-risk + discipler load */}
      <div className="mt-3.5 grid grid-cols-[1.7fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
        <Card>
          <CardTitle right={`${needsAttention.length} across all disciplers`}>
            At-risk disciples
          </CardTitle>
          {needsAttention.length === 0 ? (
            <div className="border-t border-cream-surface px-5 py-5 text-center text-[12px] font-medium text-ink/50">
              No one needs attention — every disciple is walking steady.
            </div>
          ) : (
            needsAttention.map((d) => {
              const e = engagement(d.days)
              const discipler = disciplers.find((x) => x.id === d.disciplerId)
              const group = lifeGroups.find((x) => x.id === d.lifeGroupId)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => openAdminDetail(d.id)}
                  className="flex w-full cursor-pointer items-center gap-3 border-t border-cream-surface px-5 py-[11px] text-left hover:bg-cream"
                >
                  <AvatarDisc name={d.name} stage={d.stage} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-display text-[13px] font-bold text-ink">
                        {d.name}
                      </span>
                      <StageBadge stage={d.stage} small />
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-medium text-ink/50">
                      {discipler?.name ?? '—'} · {group?.name ?? '—'} · {d.cohort}
                    </div>
                  </div>
                  <span
                    className="flex-none rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{ background: e.bg, color: e.fg }}
                  >
                    {d.days} days
                  </span>
                </button>
              )
            })
          )}
        </Card>

        <Card>
          <CardTitle>Discipler load</CardTitle>
          <div
            className="grid grid-cols-[1fr_auto_auto] gap-x-3.5 px-5 pb-2 text-[9.5px] font-bold uppercase text-ink/40"
            style={{ letterSpacing: '.08em' }}
          >
            <span>Discipler</span>
            <span className="text-right">Load</span>
            <span className="text-right">Last log</span>
          </div>
          {disciplers.map((discipler) => {
            const load = disciples.filter(
              (d) => d.disciplerId === discipler.id,
            ).length
            const group = lifeGroups.find((x) => x.id === discipler.lifeGroupId)
            const inactive = discipler.lastLogDays > ENGAGEMENT.amberAfterDays
            return (
              <div
                key={discipler.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3.5 border-t border-cream-surface px-5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-[12.5px] font-bold text-ink">
                      {discipler.name}
                    </span>
                    {inactive && (
                      <span
                        className="flex-none rounded-full bg-rose px-[7px] py-[3px] text-[8.5px] font-bold uppercase text-maroon"
                        style={{ letterSpacing: '.05em' }}
                      >
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[10.5px] font-medium text-ink/45">
                    {group?.name ?? '—'}
                  </div>
                </div>
                <span className="text-right text-[12px] font-bold text-ink">
                  {load}
                </span>
                <span
                  className="text-right text-[11.5px] font-semibold"
                  style={{
                    color: inactive ? 'var(--color-brand)' : 'rgb(11 11 12 / .55)',
                  }}
                >
                  {daysAgoLabel(discipler.lastLogDays)}
                </span>
              </div>
            )
          })}
        </Card>
      </div>
    </div>
  )
}
