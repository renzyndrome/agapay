import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowUp, Calendar, Plus } from 'lucide-react'
import { nextStage } from '#/lib/stages'
import { useStore } from '#/store'
import {
  AttendanceSparkline,
  ChecklistCard,
  MeetingsList,
  MilestonesList,
  TimelineList,
} from '#/components/disciple-detail'
import { AvatarDisc, EngagementBadge, StageBadge } from '#/components/ui'

export const Route = createFileRoute('/_discipler/disciples/$id')({
  component: ProfileScreen,
})

type ProfileTab = 'timeline' | 'checklist' | 'meetings' | 'milestones'

function ProfileScreen() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { disciples, disciplers, openSheet } = useStore()
  const [tab, setTab] = useState<ProfileTab>('timeline')
  const d = disciples.find((x) => x.id === id)
  if (!d) return null

  const discipler = disciplers.find((x) => x.id === d.disciplerId)
  const ns = nextStage(d.stage)

  const tabStyle = (active: boolean) => ({
    background: active ? 'var(--color-ink)' : 'var(--color-white)',
    color: active ? '#fff' : 'var(--color-ink-700)',
  })

  return (
    <div className="animate-fade absolute inset-0 z-20 flex flex-col bg-cream">
      <div className="flex flex-none items-center gap-2.5 border-b border-cream-border bg-white px-4 py-3.5">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate({ to: '/disciples' })}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink"
        >
          <ArrowLeft size={18} strokeWidth={2.4} />
        </button>
        <span className="font-display text-[14px] font-bold text-ink">
          Disciple profile
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* header */}
        <div className="border-b border-cream-border bg-white px-5 pt-4.5 pb-4">
          <div className="flex items-center gap-3.5">
            <AvatarDisc name={d.name} stage={d.stage} size={60} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[19px] font-bold tracking-[-.01em] text-ink">
                {d.name}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StageBadge stage={d.stage} />
                <EngagementBadge days={d.days} />
              </div>
              <div className="mt-1.5 text-[11.5px] font-medium text-ink/55">
                Discipler: {discipler?.name ?? '—'} · {d.inStageLabel} in stage
              </div>
            </div>
          </div>

          <div className="mt-4">
            <AttendanceSparkline disciple={d} />
          </div>

          {ns ? (
            <button
              type="button"
              onClick={() => openSheet({ kind: 'promote', discipleId: d.id })}
              className="press mt-3 flex h-11 w-full cursor-pointer items-center justify-center gap-[7px] rounded-full border-[1.5px] border-brand text-[13px] font-bold text-maroon"
            >
              <ArrowUp size={14} strokeWidth={2.4} />
              Promote to {ns}
            </button>
          ) : null}
        </div>

        {/* section tabs */}
        <div className="flex gap-[5px] overflow-x-auto px-5 pt-3.5 pb-1">
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

        <div className="px-5 pt-3 pb-5">
          {tab === 'timeline' && <TimelineList disciple={d} />}
          {tab === 'checklist' && <ChecklistCard disciple={d} />}
          {tab === 'meetings' && <MeetingsList discipleId={d.id} />}
          {tab === 'milestones' && <MilestonesList disciple={d} />}
        </div>

        {/* bottom actions */}
        <div className="flex gap-2 px-5 pb-6">
          <button
            type="button"
            onClick={() => openSheet({ kind: 'log', discipleId: d.id })}
            className="press flex h-11.5 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-brand text-[13px] font-bold text-white shadow-(--shadow-glow) hover:bg-brand-press"
          >
            <Plus size={14} strokeWidth={2.4} /> Log activity
          </button>
          <button
            type="button"
            onClick={() => openSheet({ kind: 'sched', discipleId: d.id })}
            className="press flex h-11.5 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border-[1.5px] border-cream-border bg-white text-[13px] font-bold text-maroon"
          >
            <Calendar size={14} strokeWidth={2.2} /> Schedule
          </button>
        </div>
      </div>
    </div>
  )
}
