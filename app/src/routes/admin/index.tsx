import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { checklistPct, upcomingThisWeek } from '#/lib/derive'
import { ENGAGEMENT, engagement } from '#/lib/engagement'
import { daysAgoLabel } from '#/lib/format'
import { STAGES, stageBar, stagePill } from '#/lib/stages'
import { useStore } from '#/store'
import { AvatarDisc, Card, StageBadge } from '#/components/ui'

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

const COHORTS = ['Q1 2026', 'Q2 2026', '2025 Batch 2']

function AdminDashboard() {
  const { disciples, meetings, disciplers } = useStore()
  const [cohort, setCohort] = useState('all')
  const pool = disciples.filter((d) => cohort === 'all' || d.cohort === cohort)
  const needsAttention = pool
    .filter((d) => d.days > ENGAGEMENT.amberAfterDays)
    .sort((a, b) => b.days - a.days)
  const week = upcomingThisWeek(meetings)

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
        <select
          value={cohort}
          onChange={(e) => setCohort(e.target.value)}
          className="h-[42px] rounded-(--radius-input) border-[1.5px] border-cream-border bg-white px-3 text-[12.5px] font-semibold text-ink"
        >
          <option value="all">All cohorts</option>
          {COHORTS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* stage funnel */}
      <div className="mt-5.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
        {STAGES.map((stage) => {
          const group = pool.filter((d) => d.stage === stage)
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
              <div className="flex items-center justify-between">
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
                <ArrowRight size={14} strokeWidth={2.4} className="text-ink/25" />
              </div>
              <div className="mt-2.5 font-display text-[36px] leading-none font-extrabold text-ink">
                {group.length}
              </div>
              <div className="mt-1.5 text-[11.5px] font-medium text-ink/50">
                avg checklist {avg}%
              </div>
            </Card>
          )
        })}
      </div>

      <div className="mt-3.5 grid grid-cols-[1.2fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
        {/* at-risk list */}
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
                      {discipler?.name ?? '—'} · {d.cohort}
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

        {/* discipler load */}
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
            const inactive = discipler.lastLogDays > ENGAGEMENT.amberAfterDays
            return (
              <div
                key={discipler.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3.5 border-t border-cream-surface px-5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
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
