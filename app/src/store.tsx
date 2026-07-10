import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import {
  ADMIN_NAME,
  CURRENT_DISCIPLER_ID,
  DISCIPLERS,
  DISCIPLES,
  MASTER_CHECKLISTS,
  MEETINGS,
} from '#/data/seed'
import type {
  ActivityType,
  Disciple,
  Discipler,
  MasterChecklists,
  Meeting,
  MeetingMode,
  Recurrence,
} from '#/data/seed'
import { fmtShort, fromISODate, today } from '#/lib/format'
import { nextStage } from '#/lib/stages'
import type { Stage } from '#/lib/stages'

export type SheetState =
  | { kind: 'log'; discipleId: string }
  | { kind: 'sched'; discipleId: string | null }
  | { kind: 'promote'; discipleId: string }
  | { kind: 'outcome'; meetingId: string }
  | null

interface ScheduleInput {
  discipleId: string
  dateISO: string
  time: string
  durationMin: number
  mode: MeetingMode
  place: string
  recurrence: Recurrence
}

interface Store {
  disciples: Array<Disciple>
  meetings: Array<Meeting>
  masterChecklists: MasterChecklists
  disciplers: Array<Discipler>
  currentDisciplerId: string
  adminName: string
  toast: string | null
  sheet: SheetState
  openSheet: (sheet: SheetState) => void
  closeSheet: () => void
  showToast: (msg: string) => void
  logActivity: (
    discipleId: string,
    type: ActivityType,
    dateISO: string,
    notes: string,
  ) => void
  scheduleMeeting: (input: ScheduleInput) => void
  completeMeeting: (meetingId: string, notes: string) => void
  cancelMeeting: (meetingId: string) => void
  noshowMeeting: (meetingId: string) => void
  toggleChecklistItem: (discipleId: string, index: number) => void
  promoteDisciple: (discipleId: string, note: string) => void
  reassignDisciples: (ids: Array<string>, toDisciplerId: string) => void
  addMasterItem: (stage: Stage, text: string) => void
  removeMasterItem: (stage: Stage, index: number) => void
  moveMasterItem: (stage: Stage, from: number, to: number) => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [disciples, setDisciples] = useState<Array<Disciple>>(DISCIPLES)
  const [meetings, setMeetings] = useState<Array<Meeting>>(MEETINGS)
  const [masterChecklists, setMasterChecklists] =
    useState<MasterChecklists>(MASTER_CHECKLISTS)
  const [toast, setToast] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }, [])

  const openSheet = useCallback((s: SheetState) => setSheet(s), [])
  const closeSheet = useCallback(() => setSheet(null), [])

  const logActivity = useCallback(
    (discipleId: string, type: ActivityType, dateISO: string, notes: string) => {
      const dateLabel = fmtShort(fromISODate(dateISO))
      let firstName = 'them'
      setDisciples((prev) =>
        prev.map((d) => {
          if (d.id !== discipleId) return d
          firstName = d.name.split(' ')[0] ?? 'them'
          return {
            ...d,
            days: 0,
            lastSeen: `${type}, ${dateLabel}`,
            timeline: [
              {
                kind: type === 'Note' ? ('note' as const) : ('activity' as const),
                title: type,
                dateLabel,
                note: notes || undefined,
              },
              ...d.timeline,
            ],
          }
        }),
      )
      setSheet(null)
      showToast(`Logged — thanks for walking with ${firstName}!`)
    },
    [showToast],
  )

  const scheduleMeeting = useCallback(
    (input: ScheduleInput) => {
      setMeetings((prev) => [
        ...prev,
        { id: `m${prev.length + 100}`, status: 'upcoming' as const, ...input },
      ])
      setSheet(null)
      showToast(
        input.recurrence === 'none'
          ? 'Meeting scheduled'
          : `Meeting scheduled — repeats ${input.recurrence}`,
      )
    },
    [showToast],
  )

  const completeMeeting = useCallback(
    (meetingId: string, notes: string) => {
      const dateLabel = fmtShort(today())
      setMeetings((prev) => {
        const meeting = prev.find((m) => m.id === meetingId)
        if (meeting) {
          setDisciples((ds) =>
            ds.map((d) =>
              d.id === meeting.discipleId
                ? {
                    ...d,
                    days: 0,
                    timeline: [
                      {
                        kind: 'meeting' as const,
                        title: 'Meeting completed',
                        dateLabel,
                        note: notes || undefined,
                      },
                      ...d.timeline,
                    ],
                  }
                : d,
            ),
          )
        }
        return prev.map((m) =>
          m.id === meetingId
            ? { ...m, status: 'completed' as const, note: notes || undefined }
            : m,
        )
      })
      setSheet(null)
      showToast('Meeting completed — well done!')
    },
    [showToast],
  )

  const cancelMeeting = useCallback(
    (meetingId: string) => {
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId ? { ...m, status: 'cancelled' as const } : m,
        ),
      )
      showToast('Meeting cancelled')
    },
    [showToast],
  )

  const noshowMeeting = useCallback(
    (meetingId: string) => {
      setMeetings((prev) =>
        prev.map((m) => (m.id === meetingId ? { ...m, status: 'noshow' as const } : m)),
      )
      showToast('Marked as no-show — maybe try a different day?')
    },
    [showToast],
  )

  const toggleChecklistItem = useCallback((discipleId: string, index: number) => {
    setDisciples((prev) =>
      prev.map((d) =>
        d.id === discipleId
          ? {
              ...d,
              checklist: d.checklist.map((it, i) =>
                i === index ? { ...it, done: !it.done } : it,
              ),
            }
          : d,
      ),
    )
  }, [])

  const promoteDisciple = useCallback(
    (discipleId: string, note: string) => {
      if (!note.trim()) {
        showToast('A note is required to promote')
        return
      }
      setDisciples((prev) =>
        prev.map((d) => {
          if (d.id !== discipleId) return d
          const ns = nextStage(d.stage)
          if (!ns) return d
          return {
            ...d,
            stage: ns,
            inStageLabel: 'Just promoted',
            checklist: masterChecklists[ns].map((text) => ({ text, done: false })),
            timeline: [
              {
                kind: 'stage' as const,
                title: `Promoted to ${ns}`,
                dateLabel: fmtShort(today()),
                note,
              },
              ...d.timeline,
            ],
          }
        }),
      )
      setSheet(null)
      showToast('Promoted — a new chapter begins!')
    },
    [masterChecklists, showToast],
  )

  const reassignDisciples = useCallback(
    (ids: Array<string>, toDisciplerId: string) => {
      setDisciples((prev) =>
        prev.map((d) =>
          ids.includes(d.id) ? { ...d, disciplerId: toDisciplerId } : d,
        ),
      )
      const to = DISCIPLERS.find((x) => x.id === toDisciplerId)
      showToast(
        `${ids.length} disciple${ids.length > 1 ? 's' : ''} reassigned to ${to?.name ?? 'discipler'}`,
      )
    },
    [showToast],
  )

  const addMasterItem = useCallback(
    (stage: Stage, text: string) => {
      setMasterChecklists((prev) => ({ ...prev, [stage]: [...prev[stage], text] }))
      showToast('Item added')
    },
    [showToast],
  )

  const removeMasterItem = useCallback(
    (stage: Stage, index: number) => {
      setMasterChecklists((prev) => ({
        ...prev,
        [stage]: prev[stage].filter((_, i) => i !== index),
      }))
      showToast('Item removed')
    },
    [showToast],
  )

  const moveMasterItem = useCallback((stage: Stage, from: number, to: number) => {
    setMasterChecklists((prev) => {
      const items = [...prev[stage]]
      if (from < 0 || from >= items.length) return prev
      const [moved] = items.splice(from, 1)
      items.splice(to, 0, moved)
      return { ...prev, [stage]: items }
    })
  }, [])

  const value = useMemo<Store>(
    () => ({
      disciples,
      meetings,
      masterChecklists,
      disciplers: DISCIPLERS,
      currentDisciplerId: CURRENT_DISCIPLER_ID,
      adminName: ADMIN_NAME,
      toast,
      sheet,
      openSheet,
      closeSheet,
      showToast,
      logActivity,
      scheduleMeeting,
      completeMeeting,
      cancelMeeting,
      noshowMeeting,
      toggleChecklistItem,
      promoteDisciple,
      reassignDisciples,
      addMasterItem,
      removeMasterItem,
      moveMasterItem,
    }),
    [
      disciples,
      meetings,
      masterChecklists,
      toast,
      sheet,
      openSheet,
      closeSheet,
      showToast,
      logActivity,
      scheduleMeeting,
      completeMeeting,
      cancelMeeting,
      noshowMeeting,
      toggleChecklistItem,
      promoteDisciple,
      reassignDisciples,
      addMasterItem,
      removeMasterItem,
      moveMasterItem,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside StoreProvider')
  return store
}
