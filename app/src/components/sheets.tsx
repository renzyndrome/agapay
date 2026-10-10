import { useState } from 'react'
import { ArrowRight, MapPin, Video } from 'lucide-react'
import { ACTIVITY_TYPES } from '#/data/seed'
import type { ActivityType, MeetingMode, Recurrence } from '#/data/seed'
import { addDays, toISODate, today } from '#/lib/format'
import { nextStage, stagePill } from '#/lib/stages'
import { useInFlight } from '#/lib/useInFlight'
import { useStore } from '#/store'
import { AddDiscipleSheet } from '#/components/add-disciple-sheet'
import { useDisciple, useDisciples } from '#/features/disciples/hooks'
import { useMeetings } from '#/features/meetings/hooks'
import {
  useCompleteMeeting,
  useLogActivity,
  usePromoteDisciple,
  useScheduleMeeting,
} from '#/features/mutations'
import {
  BottomSheet,
  FieldLabel,
  Overlay,
  SelectorChip,
  inputClass,
} from '#/components/ui'

/** All discipler sheets/modals, rendered inside the phone frame. */
export function Sheets() {
  const { sheet } = useStore()
  if (!sheet) return null
  if (sheet.kind === 'log') return <LogSheet discipleId={sheet.discipleId} />
  if (sheet.kind === 'sched') return <ScheduleSheet discipleId={sheet.discipleId} />
  if (sheet.kind === 'promote') return <PromoteModal discipleId={sheet.discipleId} />
  if (sheet.kind === 'add') return <AddDiscipleSheet />
  return <OutcomeSheet meetingId={sheet.meetingId} />
}

function LogSheet({ discipleId }: { discipleId: string }) {
  const { closeSheet } = useStore()
  const logActivity = useLogActivity()
  const [saving, runSave] = useInFlight()
  const [type, setType] = useState<ActivityType>('One-on-one')
  const [dateISO, setDateISO] = useState(toISODate(today()))
  const [notes, setNotes] = useState('')
  const { data: disciple } = useDisciple(discipleId)
  if (!disciple) return null
  // No activity is logged ahead of time.
  const maxDateISO = toISODate(today())

  return (
    <Overlay onClose={closeSheet}>
      <BottomSheet>
        <div className="font-display text-[16px] font-bold text-ink">Log activity</div>
        <div className="mt-0.5 text-[12px] font-medium text-ink/55">
          with <b className="text-maroon">{disciple.name}</b>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {ACTIVITY_TYPES.map((t) => (
            <SelectorChip key={t} selected={type === t} onClick={() => setType(t)}>
              {t}
            </SelectorChip>
          ))}
        </div>
        <div className="mt-3">
          <FieldLabel>Date</FieldLabel>
          <input
            type="date"
            value={dateISO}
            max={maxDateISO}
            onChange={(e) => setDateISO(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="mt-3">
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Conversation notes"
            className={`${inputClass} h-18 resize-none py-2.5 font-medium`}
          />
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void runSave(() => logActivity(discipleId, type, dateISO, notes))}
          className="press mt-3.5 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white shadow-(--shadow-glow) hover:bg-brand-press disabled:cursor-not-allowed disabled:bg-ink-300 disabled:shadow-none"
        >
          {saving ? 'Saving…' : 'Save activity'}
        </button>
      </BottomSheet>
    </Overlay>
  )
}

const DURATIONS = [30, 45, 60, 90]
const RECURRENCES: Array<[Recurrence, string]> = [
  ['none', 'None'],
  ['weekly', 'Weekly'],
  ['biweekly', 'Biweekly'],
]

function ScheduleSheet({ discipleId }: { discipleId: string | null }) {
  const { closeSheet } = useStore()
  const scheduleMeeting = useScheduleMeeting()
  const [scheduling, runSchedule] = useInFlight()
  const { data: mine } = useDisciples('mine')
  const [who, setWho] = useState(
    discipleId ?? (mine.length > 0 ? mine[0].id : ''),
  )
  const [dateISO, setDateISO] = useState(toISODate(addDays(today(), 4)))
  const [time, setTime] = useState('19:00')
  const [durationMin, setDurationMin] = useState(60)
  const [mode, setMode] = useState<MeetingMode>('inperson')
  const [place, setPlace] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>('none')

  const modeBtn = (selected: boolean) => ({
    background: selected ? 'var(--color-ink)' : 'var(--color-white)',
    color: selected ? '#fff' : 'var(--color-ink-700)',
    border: `1.5px solid ${selected ? 'var(--color-ink)' : 'var(--color-cream-border)'}`,
  })

  return (
    <Overlay onClose={closeSheet}>
      <BottomSheet>
        <div className="font-display text-[16px] font-bold text-ink">
          Schedule meeting
        </div>
        <div className="mt-3.5">
          <FieldLabel>Disciple</FieldLabel>
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className={inputClass}
          >
            {mine.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div>
            <FieldLabel>Date</FieldLabel>
            <input
              type="date"
              value={dateISO}
              onChange={(e) => setDateISO(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel>Time</FieldLabel>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-3">
          <FieldLabel>Duration</FieldLabel>
          <div className="flex gap-1.5">
            {DURATIONS.map((v) => (
              <SelectorChip
                key={v}
                grow
                selected={durationMin === v}
                onClick={() => setDurationMin(v)}
              >
                {v} min
              </SelectorChip>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <FieldLabel>Mode</FieldLabel>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setMode('inperson')}
              className="press flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-(--radius-input) text-[12.5px] font-bold"
              style={modeBtn(mode === 'inperson')}
            >
              <MapPin size={14} strokeWidth={2.4} /> In-person
            </button>
            <button
              type="button"
              onClick={() => setMode('online')}
              className="press flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-(--radius-input) text-[12.5px] font-bold"
              style={modeBtn(mode === 'online')}
            >
              <Video size={14} strokeWidth={2.2} /> Online
            </button>
          </div>
        </div>
        <div className="mt-3">
          <FieldLabel>{mode === 'online' ? 'Meeting link' : 'Location'}</FieldLabel>
          <input
            type="text"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder={
              mode === 'online'
                ? 'Paste Google Meet / Zoom link'
                : 'e.g. Kape Kada, Calamba'
            }
            className={inputClass}
          />
        </div>
        <div className="mt-3">
          <FieldLabel>Repeats</FieldLabel>
          <div className="flex gap-1.5">
            {RECURRENCES.map(([value, label]) => (
              <SelectorChip
                key={value}
                grow
                selected={recurrence === value}
                onClick={() => setRecurrence(value)}
              >
                {label}
              </SelectorChip>
            ))}
          </div>
        </div>
        <button
          type="button"
          disabled={scheduling}
          onClick={() =>
            void runSchedule(() =>
              scheduleMeeting({
                discipleId: who,
                dateISO,
                time,
                durationMin,
                mode,
                place: place || (mode === 'online' ? 'Online' : 'Quest Laguna Main'),
                recurrence,
              }),
            )
          }
          className="press mt-4 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white shadow-(--shadow-glow) hover:bg-brand-press disabled:cursor-not-allowed disabled:bg-ink-300 disabled:shadow-none"
        >
          {scheduling ? 'Scheduling…' : 'Schedule meeting'}
        </button>
      </BottomSheet>
    </Overlay>
  )
}

function PromoteModal({ discipleId }: { discipleId: string }) {
  const { closeSheet } = useStore()
  const promoteDisciple = usePromoteDisciple()
  const [promoting, runPromote] = useInFlight()
  const [note, setNote] = useState('')
  const { data: disciple } = useDisciple(discipleId)
  if (!disciple) return null
  const first = disciple.name.split(' ')[0]
  const ns = nextStage(disciple.stage)
  if (!ns) return null
  const cur = stagePill(disciple.stage)
  const nxt = stagePill(ns)
  const canConfirm = note.trim().length > 0 && !promoting

  const pillStyle = (c: { bg: string; fg: string }) => ({
    background: c.bg,
    color: c.fg,
    letterSpacing: '.05em',
    padding: '4px 10px',
  })

  return (
    <Overlay onClose={closeSheet} centered>
      <div className="animate-sheet-up relative rounded-(--radius-sheet) bg-white px-5 py-5.5 shadow-(--shadow-pop)">
        <div className="font-display text-[17px] font-bold text-ink">
          Promote {first}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="rounded-full text-[9px] font-bold uppercase" style={pillStyle(cur)}>
            {disciple.stage}
          </span>
          <ArrowRight size={14} strokeWidth={2.6} className="text-brand" />
          <span className="rounded-full text-[9px] font-bold uppercase" style={pillStyle(nxt)}>
            {ns}
          </span>
        </div>
        <div className="mt-3 text-[12.5px] leading-relaxed font-medium text-ink/60">
          Note required. Visible to church leadership.
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Promotion note (required)"
          className={`${inputClass} mt-3 h-21 resize-none py-2.5 font-medium`}
        />
        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            onClick={closeSheet}
            className="press flex h-11.5 flex-1 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-cream-border text-[13px] font-bold text-ink-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => void runPromote(() => promoteDisciple(discipleId, note))}
            className="press flex h-11.5 flex-1 items-center justify-center rounded-full text-[13px] font-bold text-white"
            style={{
              background: canConfirm ? 'var(--color-brand)' : 'var(--color-ink-300)',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            {promoting ? 'Promoting…' : 'Confirm'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function OutcomeSheet({ meetingId }: { meetingId: string }) {
  const { closeSheet } = useStore()
  // Live and demo alike: the store holds only the seeded demo meetings.
  const { data: meetings } = useMeetings()
  const completeMeeting = useCompleteMeeting()
  const [completing, runComplete] = useInFlight()
  const [notes, setNotes] = useState('')
  const meeting = meetings.find((m) => m.id === meetingId)
  const { data: disciple } = useDisciple(meeting?.discipleId ?? '')
  if (!meeting || !disciple) return null

  return (
    <Overlay onClose={closeSheet}>
      <BottomSheet>
        <div className="font-display text-[16px] font-bold text-ink">Meeting outcome</div>
        <div className="mt-0.5 text-[12px] font-medium text-ink/55">
          Marking meeting with <b className="text-maroon">{disciple.name}</b> as
          completed
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Meeting notes (optional)"
          className={`${inputClass} mt-3.5 h-21 resize-none py-2.5 font-medium`}
        />
        <button
          type="button"
          disabled={completing}
          onClick={() => void runComplete(() => completeMeeting(meetingId, notes))}
          className="press mt-3.5 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-green text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:bg-ink-300"
        >
          {completing ? 'Saving…' : 'Mark completed'}
        </button>
      </BottomSheet>
    </Overlay>
  )
}
