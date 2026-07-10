import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { checklistPct } from '#/lib/derive'
import { engagement } from '#/lib/engagement'
import { daysAgoLabel } from '#/lib/format'
import { useStore } from '#/store'
import {
  AvatarDisc,
  Card,
  ProgressBar,
  StageBadge,
  StatusDot,
} from '#/components/ui'

export const Route = createFileRoute('/_discipler/disciples/')({
  component: DisciplesScreen,
})

function DisciplesScreen() {
  const { disciples, currentDisciplerId } = useStore()
  const navigate = useNavigate()
  const mine = disciples.filter((d) => d.disciplerId === currentDisciplerId)

  return (
    <div>
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <span className="font-display text-[20px] font-bold tracking-[-.01em] text-ink">
          My Disciples
        </span>
        <span className="text-[11.5px] font-semibold text-ink/45">
          {mine.length} assigned to you
        </span>
      </div>
      <div className="flex flex-col gap-2 px-5 pb-5">
        {mine.map((d) => {
          const e = engagement(d.days)
          const pct = checklistPct(d)
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
                      {e.label} · last activity {daysAgoLabel(d.days).toLowerCase()}
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
