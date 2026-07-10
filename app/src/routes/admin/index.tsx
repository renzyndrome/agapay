import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { Disciple } from '#/data/seed'
import { checklistPct, upcomingThisWeek } from '#/lib/derive'
import { ENGAGEMENT, engagement } from '#/lib/engagement'
import { daysAgoLabel, initials } from '#/lib/format'
import { STAGES, stageBar, stagePill } from '#/lib/stages'
import { useStore } from '#/store'
import { AvatarDisc, Card, StageBadge, StatusDot } from '#/components/ui'

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

function AdminDashboard() {
  const { disciples, meetings, disciplers, lifeGroups } = useStore()
  const [cohort, setCohort] = useState('all')
  const [circle, setCircle] = useState('all')

  const cohortPool = disciples.filter((d) => cohort === 'all' || d.cohort === cohort)
  const pool = cohortPool.filter((d) => circle === 'all' || d.lifeGroupId === circle)
  const needsAttention = pool
    .filter((d) => d.days > ENGAGEMENT.amberAfterDays)
    .sort((a, b) => b.days - a.days)
  const week = upcomingThisWeek(meetings)
  const eng = countEngagement(pool)

  const filterSelectClass =
    'h-[42px] rounded-(--radius-input) border-[1.5px] border-cream-border bg-white px-3 text-[12.5px] font-semibold text-ink'

  return (
    <div className="max-w-265 px-8 pt-7 pb-10 max-md:px-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-display text-[24px] font-bold tracking-[-.01em] text-ink">
            Dashboard
          </div>
          <div className="mt-0.5 text-[13px] font-medium text-ink/55">
            {pool.length} disciples · {needsAttention.length} need attention ·{' '}
            {week.length} meetings this week
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

      {/* stage overview */}
      <div className="mt-5.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
        {STAGES.map((stage) => {
          const group = pool.filter((d) => d.stage === stage)
          const share = pool.length
            ? Math.round((100 * group.length) / pool.length)
            : 0
          const avg = group.length
            ? Math.round(
                group.reduce((sum, d) => sum + checklistPct(d), 0) / group.length,
              )
            : 0
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
                <span className="font-display text-[36px] leading-none font-extrabold text-ink">
                  {group.length}
                </span>
                <span className="text-[12px] font-bold text-ink/45">{share}%</span>
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

      {/* engagement health + quest circles */}
      <div className="mt-3.5 grid grid-cols-[1fr_1.4fr] items-start gap-3.5 max-md:grid-cols-1">
        <Card className="px-5 pt-4 pb-5">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[14px] font-bold text-ink">
              Engagement health
            </span>
            <span className="text-[11px] font-semibold text-ink/45">
              {eng.total} disciples
            </span>
          </div>
          <div className="mt-4">
            <EngagementStackedBar counts={eng} height={14} />
          </div>
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
          <div className="mt-4 border-t border-cream-surface pt-3 text-[11.5px] leading-relaxed font-medium text-ink/50">
            Healthy ≤ {ENGAGEMENT.amberAfterDays} days since last activity · At-risk
            &gt; {ENGAGEMENT.redAfterDays} days
          </div>
        </Card>

        <Card>
          <div className="flex items-baseline justify-between px-5 pt-4 pb-3">
            <span className="font-display text-[14px] font-bold text-ink">
              Quest Circles
            </span>
            <span className="text-[11px] font-semibold text-ink/45">
              {lifeGroups.length} circles · Quest Laguna Main
            </span>
          </div>
          {lifeGroups.map((g) => {
            const members = cohortPool.filter((d) => d.lifeGroupId === g.id)
            const groupEng = countEngagement(members)
            const leader = disciplers.find((x) => x.id === g.leaderDisciplerId)
            const avg = members.length
              ? Math.round(
                  members.reduce((sum, d) => sum + checklistPct(d), 0) /
                    members.length,
                )
              : 0
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
                      Led by {leader?.name ?? '—'} · {members.length} disciples ·
                      avg checklist {avg}%
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
      </div>

      {/* at-risk + discipler load */}
      <div className="mt-3.5 grid grid-cols-[1.2fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
        <Card>
          <div className="flex items-baseline justify-between px-5 pt-4 pb-3">
            <span className="font-display text-[14px] font-bold text-ink">
              At-risk disciples
            </span>
            <span className="text-[11px] font-semibold text-ink/45">
              {needsAttention.length} across all disciplers
            </span>
          </div>
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
                <div
                  key={d.id}
                  className="flex items-center gap-3 border-t border-cream-surface px-5 py-[11px]"
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
                </div>
              )
            })
          )}
        </Card>

        <Card>
          <div className="px-5 pt-4 pb-3">
            <span className="font-display text-[14px] font-bold text-ink">
              Discipler load
            </span>
          </div>
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
