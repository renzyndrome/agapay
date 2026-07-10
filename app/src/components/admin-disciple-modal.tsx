import { useState } from 'react'
import { X } from 'lucide-react'
import { daysAgoLabel } from '#/lib/format'
import { useStore } from '#/store'
import {
  AttendanceSparkline,
  ChecklistCard,
  MeetingsList,
  MilestonesList,
  TimelineList,
} from '#/components/disciple-detail'
import { AvatarDisc, EngagementBadge, StageBadge } from '#/components/ui'

type DetailTab = 'timeline' | 'checklist' | 'meetings' | 'milestones'

/** Admin-side disciple detail — centered modal over the admin pane. */
export function AdminDiscipleModal() {
  const { adminDetailId, closeAdminDetail, disciples, disciplers, lifeGroups } =
    useStore()
  const [tab, setTab] = useState<DetailTab>('timeline')
  const d = adminDetailId ? disciples.find((x) => x.id === adminDetailId) : undefined
  if (!d) return null

  const discipler = disciplers.find((x) => x.id === d.disciplerId)
  const group = lifeGroups.find((x) => x.id === d.lifeGroupId)

  const tabStyle = (active: boolean) => ({
    background: active ? 'var(--color-ink)' : 'var(--color-white)',
    color: active ? '#fff' : 'var(--color-ink-700)',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Close"
        onClick={closeAdminDetail}
        className="animate-fade absolute inset-0 cursor-default bg-ink/40"
      />
      <div className="animate-sheet-up relative flex max-h-[88vh] w-full max-w-[640px] flex-col overflow-hidden rounded-(--radius-sheet) bg-cream shadow-(--shadow-pop)">
        {/* header */}
        <div className="flex-none border-b border-cream-border bg-white px-6 pt-5 pb-4.5">
          <div className="flex items-start gap-3.5">
            <AvatarDisc name={d.name} stage={d.stage} size={52} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[18px] font-bold tracking-[-.01em] text-ink">
                {d.name}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StageBadge stage={d.stage} />
                <EngagementBadge days={d.days} />
                <span className="rounded-full bg-cream-surface px-2 py-[3px] text-[9.5px] font-bold tracking-wider text-ink-700 uppercase">
                  {group?.name ?? '—'}
                </span>
              </div>
              <div className="mt-1.5 text-[11.5px] font-medium text-ink/55">
                Discipler: {discipler?.name ?? '—'} · {d.cohort} · {d.inStageLabel} in
                stage · last activity {daysAgoLabel(d.days).toLowerCase()}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={closeAdminDetail}
              className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-full text-ink/45 hover:bg-cream-surface hover:text-ink"
            >
              <X size={17} strokeWidth={2.4} />
            </button>
          </div>
          <div className="mt-3.5">
            <AttendanceSparkline disciple={d} />
          </div>
        </div>

        {/* tabs */}
        <div className="flex flex-none gap-[5px] px-6 pt-3.5 pb-1">
          {(['timeline', 'checklist', 'meetings', 'milestones'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="flex-none cursor-pointer rounded-full border-[1.5px] border-cream-border px-3.5 py-2 text-[11.5px] font-bold capitalize"
              style={tabStyle(tab === t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* content */}
        <div className="flex-1 overflow-y-auto px-6 pt-3 pb-6">
          {tab === 'timeline' && <TimelineList disciple={d} />}
          {tab === 'checklist' && <ChecklistCard disciple={d} />}
          {tab === 'meetings' && <MeetingsList discipleId={d.id} />}
          {tab === 'milestones' && <MilestonesList disciple={d} />}
        </div>
      </div>
    </div>
  )
}
