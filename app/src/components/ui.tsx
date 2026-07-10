import type { CSSProperties, ReactNode } from 'react'
import { engagement } from '#/lib/engagement'
import { initials } from '#/lib/format'
import { stagePill } from '#/lib/stages'
import type { Stage } from '#/lib/stages'
import { useStore } from '#/store'

export function AvatarDisc({
  name,
  stage,
  size,
  style,
}: {
  name: string
  stage: Stage
  size: number
  style?: CSSProperties
}) {
  const colors = stagePill(stage)
  return (
    <div
      className="flex flex-none items-center justify-center rounded-full font-display font-bold"
      style={{
        width: size,
        height: size,
        background: colors.bg,
        color: colors.fg,
        fontSize: Math.round(size * 0.32),
        ...style,
      }}
    >
      {initials(name)}
    </div>
  )
}

export function StageBadge({ stage, small }: { stage: Stage; small?: boolean }) {
  const colors = stagePill(stage)
  return (
    <span
      className="flex-none rounded-full font-bold uppercase"
      style={{
        background: colors.bg,
        color: colors.fg,
        fontSize: small ? 8.5 : 9,
        letterSpacing: '.05em',
        padding: small ? '3px 7px' : '3px 8px',
      }}
    >
      {stage}
    </span>
  )
}

export function EngagementBadge({ days }: { days: number }) {
  const e = engagement(days)
  return (
    <span
      className="flex-none rounded-full text-[9px] font-bold uppercase"
      style={{ background: e.bg, color: e.fg, letterSpacing: '.05em', padding: '3px 9px' }}
    >
      {e.label}
    </span>
  )
}

export function StatusDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      className="flex-none rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  )
}

export function SectionHeading({
  dotColor,
  color,
  children,
  right,
}: {
  dotColor?: string
  color: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      {dotColor ? <StatusDot color={dotColor} /> : null}
      <span className="section-label" style={{ color }}>
        {children}
      </span>
      {right ? <span className="ml-auto">{right}</span> : null}
    </div>
  )
}

export function Card({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`overflow-hidden rounded-(--radius-card) bg-white shadow-(--shadow-card) ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

export function ProgressBar({
  pct,
  height = 5,
}: {
  pct: number
  height?: number
}) {
  return (
    <div
      className="overflow-hidden rounded-full bg-cream-surface"
      style={{ height }}
    >
      <div
        className="h-full rounded-full bg-brand"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function DateColumn({ dow, day }: { dow: string; day: string }) {
  return (
    <div className="w-[42px] flex-none text-center">
      <div
        className="text-[10px] font-bold text-brand"
        style={{ letterSpacing: '.08em' }}
      >
        {dow}
      </div>
      <div className="font-display text-[18px] leading-[1.1] font-extrabold text-ink">
        {day}
      </div>
    </div>
  )
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-1.5 text-[10.5px] font-bold uppercase text-ink/50"
      style={{ letterSpacing: '.08em' }}
    >
      {children}
    </div>
  )
}

export const inputClass =
  'h-11 w-full rounded-(--radius-input) border-[1.5px] border-cream-border bg-cream px-3 text-[13px] font-semibold text-ink outline-none focus:border-brand'

export function SelectorChip({
  selected,
  onClick,
  children,
  grow,
  dark,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  grow?: boolean
  dark?: boolean
}) {
  const activeBg = dark ? 'var(--color-ink)' : 'var(--color-brand)'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press cursor-pointer rounded-full px-3.5 py-2.5 text-[11.5px] font-bold ${grow ? 'flex-1 text-center' : ''}`}
      style={{
        background: selected ? activeBg : 'var(--color-white)',
        color: selected ? '#fff' : 'var(--color-ink-700)',
        border: `1.5px solid ${selected ? activeBg : 'var(--color-cream-border)'}`,
      }}
    >
      {children}
    </button>
  )
}

/** Bottom sheet / centered modal scaffold with scrim; contained in the phone frame. */
export function Overlay({
  onClose,
  children,
  centered,
}: {
  onClose: () => void
  children: ReactNode
  centered?: boolean
}) {
  return (
    <div
      className={`absolute inset-0 z-40 flex flex-col ${centered ? 'justify-center px-5' : 'justify-end'}`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 cursor-default bg-ink/40"
      />
      {children}
    </div>
  )
}

export function BottomSheet({ children }: { children: ReactNode }) {
  return (
    <div className="animate-sheet-up relative max-h-[85%] overflow-y-auto rounded-t-(--radius-sheet) bg-white px-5 pt-4 pb-6">
      <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-cream-border" />
      {children}
    </div>
  )
}

export function Toast() {
  const { toast } = useStore()
  if (!toast) return null
  return (
    <div className="animate-sheet-up fixed bottom-6 left-1/2 z-100 max-w-[80%] -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-center text-[13px] font-bold text-white shadow-(--shadow-pop)">
      {toast}
    </div>
  )
}
