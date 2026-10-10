import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useStore } from '#/store'
import { engagementFromKey } from '#/lib/engagement'
import { daysAgoLabel } from '#/lib/format'
import { useDisciples } from '#/features/disciples/hooks'
import { checklistPctOf } from '#/features/types'
import {
  AvatarDisc,
  Card,
  LoadError,
  ProgressBar,
  SkeletonRows,
  StageBadge,
  StatusDot,
} from '#/components/ui'

export const Route = createFileRoute('/_discipler/disciples/')({
  component: DisciplesScreen,
})

function DisciplesScreen() {
  const navigate = useNavigate()
  const { data: mine, isLoading, error } = useDisciples('mine')
  const { openSheet } = useStore()

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <div className="font-display text-[20px] font-bold tracking-[-.01em] text-ink">
            Disciples
          </div>
          <div className="text-[11.5px] font-semibold text-ink/45">
            {mine.length} assigned
          </div>
        </div>
        <button
          type="button"
          onClick={() => openSheet({ kind: 'add' })}
          className="press flex h-11 flex-none cursor-pointer items-center gap-1.5 rounded-full bg-brand px-4 text-[12.5px] font-bold text-white hover:bg-brand-press"
        >
          <Plus size={14} strokeWidth={2.4} /> Add
        </button>
      </div>
      <div className="flex flex-col gap-2 px-5 pb-5">
        {error ? (
          <LoadError message="Disciples not loaded. Retry in a moment." />
        ) : null}
        {isLoading ? <SkeletonRows rows={5} height={68} /> : null}
        {!isLoading && !error && mine.length === 0 ? (
          <Card className="px-4 py-5 text-center text-[12px] font-medium text-ink/50">
            No disciples assigned yet.
          </Card>
        ) : null}
        {mine.map((d) => {
          const e = engagementFromKey(d.engagement)
          const pct = checklistPctOf(d)
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => navigate({ to: '/disciples/$id', params: { id: d.id } })}
              className="cursor-pointer text-left"
            >
              <Card className="flex items-center gap-3 rounded-[14px] px-3.5 py-3">
                <AvatarDisc name={d.name} stage={d.stage} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-display text-[14px] font-bold text-ink">
                      {d.name}
                    </span>
                    <StageBadge stage={d.stage} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <StatusDot color={e.dot} size={7} />
                    <span className="text-[11px] font-semibold text-ink/55">
                      {e.label} ·{' '}
                      {d.days === null
                        ? 'no activity yet'
                        : `last activity ${daysAgoLabel(d.days).toLowerCase()}`}
                    </span>
                  </div>
                </div>
                <div className="w-14 flex-none">
                  <ProgressBar pct={pct} />
                  <div className="mt-[3px] text-right text-[10px] font-bold text-ink/45">
                    {pct}%
                  </div>
                </div>
              </Card>
            </button>
          )
        })}
      </div>
    </div>
  )
}
