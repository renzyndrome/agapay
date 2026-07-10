import { useState } from 'react'
import type { StageTrendHistory } from '#/data/seed'
import { STAGES } from '#/lib/stages'
import type { Stage } from '#/lib/stages'
import { StatusDot } from '#/components/ui'

/** Line color per stage. Growing uses the darker gold-600 token — the gold-500
 *  pill tint fails contrast as a 2px stroke on white (palette validation). */
const LINE_COLOR: Record<Stage, string> = {
  'New Believer': 'var(--color-brand)',
  Growing: 'var(--color-amber)',
  Leader: 'var(--color-ink-700)',
}

const SHORT_LABEL: Record<Stage, string> = {
  'New Believer': 'New Believer',
  Growing: 'Growing',
  Leader: 'Leader',
}

const VIEW_W = 720
const VIEW_H = 230
const PAD_L = 34
const PAD_R = 116
const PAD_T = 16
const PAD_B = 28
const INNER_W = VIEW_W - PAD_L - PAD_R
const INNER_H = VIEW_H - PAD_T - PAD_B

interface StageTrendProps {
  history: StageTrendHistory
  current: Record<Stage, number>
  currentMonthLabel: string
}

export function StageTrend({ history, current, currentMonthLabel }: StageTrendProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const months = [...history.months, currentMonthLabel]
  const series = STAGES.map((stage) => ({
    stage,
    values: [...history.counts[stage], current[stage]],
  }))
  const maxValue = Math.max(...series.flatMap((s) => s.values), 1)
  const yMax = Math.max(10, Math.ceil(maxValue / 10) * 10)
  const ticks = Array.from({ length: yMax / 10 + 1 }, (_, i) => i * 10)

  const x = (i: number) =>
    PAD_L + (months.length > 1 ? (i * INNER_W) / (months.length - 1) : INNER_W / 2)
  const y = (v: number) => PAD_T + INNER_H - (v / yMax) * INNER_H

  const columnWidth = months.length > 1 ? INNER_W / (months.length - 1) : INNER_W

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block w-full"
        role="img"
        aria-label={`Disciples per stage, ${months[0]} to ${currentMonthLabel}`}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* recessive grid + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_L}
              x2={VIEW_W - PAD_R}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-cream-surface)"
              strokeWidth={t === 0 ? 1.5 : 1}
            />
            <text
              x={PAD_L - 8}
              y={y(t) + 3.5}
              textAnchor="end"
              fontSize={10}
              fontWeight={600}
              fill="rgb(11 11 12 / .4)"
              fontFamily="var(--font-body)"
            >
              {t}
            </text>
          </g>
        ))}

        {/* month labels */}
        {months.map((m, i) => (
          <text
            key={m}
            x={x(i)}
            y={VIEW_H - 8}
            textAnchor="middle"
            fontSize={10.5}
            fontWeight={i === months.length - 1 ? 800 : 600}
            fill={
              i === months.length - 1 ? 'rgb(11 11 12 / .7)' : 'rgb(11 11 12 / .4)'
            }
            fontFamily="var(--font-body)"
          >
            {m}
          </text>
        ))}

        {/* hover guide */}
        {hoverIdx !== null && (
          <line
            x1={x(hoverIdx)}
            x2={x(hoverIdx)}
            y1={PAD_T}
            y2={PAD_T + INNER_H}
            stroke="var(--color-cream-border)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        )}

        {/* lines + markers */}
        {series.map((s) => (
          <g key={s.stage}>
            <polyline
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none"
              stroke={LINE_COLOR[s.stage]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.values.map((v, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(v)}
                r={hoverIdx === i ? 5 : 4}
                fill={LINE_COLOR[s.stage]}
                stroke="var(--color-white)"
                strokeWidth={2}
              />
            ))}
            {/* direct label at line end: colored dot carries identity, text wears ink */}
            <circle
              cx={VIEW_W - PAD_R + 12}
              cy={y(s.values[s.values.length - 1] ?? 0)}
              r={4}
              fill={LINE_COLOR[s.stage]}
            />
            <text
              x={VIEW_W - PAD_R + 21}
              y={y(s.values[s.values.length - 1] ?? 0) + 3.5}
              fontSize={10.5}
              fontWeight={700}
              fill="var(--color-ink-700)"
              fontFamily="var(--font-body)"
            >
              {SHORT_LABEL[s.stage]} · {s.values[s.values.length - 1]}
            </text>
          </g>
        ))}

        {/* hover hit targets — one column per month, wider than the marks */}
        {months.map((_, i) => (
          <rect
            key={i}
            x={x(i) - columnWidth / 2}
            y={PAD_T}
            width={columnWidth}
            height={INNER_H}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
      </svg>

      {/* tooltip */}
      {hoverIdx !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-(--radius-input) bg-ink px-3 py-2.5 shadow-(--shadow-pop)"
          style={{
            left: `${(x(hoverIdx) / VIEW_W) * 100}%`,
            transform: `translateX(${hoverIdx > months.length / 2 ? '-110%' : '10%'})`,
          }}
        >
          <div className="text-[10px] font-bold tracking-wider text-white/60 uppercase">
            {months[hoverIdx]} 2026
          </div>
          {series.map((s) => (
            <div key={s.stage} className="mt-1.5 flex items-center gap-2">
              <StatusDot color={LINE_COLOR[s.stage]} size={7} />
              <span className="text-[11px] font-semibold text-white/80">
                {SHORT_LABEL[s.stage]}
              </span>
              <span className="ml-auto pl-3 text-[11px] font-bold text-white">
                {s.values[hoverIdx]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* legend */}
      <div className="mt-1 flex flex-wrap gap-4">
        {series.map((s) => (
          <div key={s.stage} className="flex items-center gap-1.5">
            <StatusDot color={LINE_COLOR[s.stage]} size={8} />
            <span className="text-[11px] font-semibold text-ink-700">
              {SHORT_LABEL[s.stage]}
            </span>
          </div>
        ))}
        <span className="ml-auto text-[10.5px] font-medium text-ink/40">
          All circles · from stage history
        </span>
      </div>
    </div>
  )
}
