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
  LIFE_GROUPS,
  MASTER_CHECKLISTS,
  MEETINGS,
} from '#/data/seed'
import { DEMO_UNASSIGNED } from '#/data/demo-directory'
import type { DemoMember } from '#/data/demo-directory'
import type {
  ActivityType,
  Disciple,
  Discipler,
  LifeGroup,
  MasterChecklists,
  Meeting,
  MeetingMode,
  Recurrence,
} from '#/data/seed'
import { fmtShort, fromISODate, today } from '#/lib/format'
import {
  MEETING_CANCELLED,
  MEETING_COMPLETED,
  MEETING_NOSHOW,
  PROMOTE_NOTE_REQUIRED,
  addedToast,
  loggedToast,
  promotedToast,
  scheduledToast,
} from '#/lib/outcomeCopy'
import { disciplesLabel } from '#/lib/reassignOutcome'
import { nextStage } from '#/lib/stages'
import type { Stage } from '#/lib/stages'

export type SheetState =
  | { kind: 'log'; discipleId: string }
  | { kind: 'sched'; discipleId: string | null }
  | { kind: 'promote'; discipleId: string }
  | { kind: 'outcome'; meetingId: string }
  | { kind: 'add' }
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
  lifeGroups: Array<LifeGroup>
  /** Demo directory members nobody walks with yet (Add a disciple search). */
  directoryExtra: Array<DemoMember>
  currentDisciplerId: string
  adminName: string
  toast: string | null
  sheet: SheetState
  /** Disciple shown in the admin detail modal (null = closed). */
  adminDetailId: string | null
  openAdminDetail: (discipleId: string) => void
  closeAdminDetail: () => void
  openSheet: (sheet: SheetState) => void
  closeSheet: () => void
  /** Closes the sheet only while it is still the given one, so a late
   *  save never closes a sheet opened meanwhile. */
  closeSheetIf: (sheet: SheetState) => void
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
  /** circleId: the Quest Circle they join; null leaves circles the new
   *  discipler does not run (same rule as the database) */
  reassignDisciples: (
    ids: Array<string>,
    toDisciplerId: string,
    circleId?: string | null,
  ) => void
  /** circleId: undefined = the discipler's own circle, null = no circle */
  linkDisciple: (memberId: string, circleId?: string | null) => void
  addNewDisciple: (name: string, stage: Stage, circleId?: string | null) => void
  /** Starts a circle led by the current discipler. Null when refused. */
  createCircle: (name: string) => string | null
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
  const [lifeGroups, setLifeGroups] = useState<Array<LifeGroup>>(LIFE_GROUPS)
  const [directoryExtra, setDirectoryExtra] =
    useState<Array<DemoMember>>(DEMO_UNASSIGNED)
  const [toast, setToast] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState>(null)
  // Deep-linkable for demos: /admin/...?disciple=<id> opens the detail modal.
  const [adminDetailId, setAdminDetailId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('disciple'),
  )
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }, [])

  const openSheet = useCallback((s: SheetState) => setSheet(s), [])
  const closeSheet = useCallback(() => setSheet(null), [])
  const closeSheetIf = useCallback(
    (target: SheetState) =>
      setSheet((prev) => (prev !== null && prev === target ? null : prev)),
    [],
  )
  const openAdminDetail = useCallback((id: string) => setAdminDetailId(id), [])
  const closeAdminDetail = useCallback(() => setAdminDetailId(null), [])

  const logActivity = useCallback(
    (discipleId: string, type: ActivityType, dateISO: string, notes: string) => {
      const dateLabel = fmtShort(fromISODate(dateISO))
      // Read from the current list: a state updater may run after this call.
      const name = disciples.find((d) => d.id === discipleId)?.name ?? ''
      setDisciples((prev) =>
        prev.map((d) => {
          if (d.id !== discipleId) return d
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
      showToast(loggedToast(type, name))
    },
    [disciples, showToast],
  )

  const scheduleMeeting = useCallback(
    (input: ScheduleInput) => {
      setMeetings((prev) => [
        ...prev,
        { id: `m${prev.length + 100}`, status: 'upcoming' as const, ...input },
      ])
      setSheet(null)
      showToast(scheduledToast(input.recurrence))
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
      showToast(MEETING_COMPLETED)
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
      showToast(MEETING_CANCELLED)
    },
    [showToast],
  )

  const noshowMeeting = useCallback(
    (meetingId: string) => {
      setMeetings((prev) =>
        prev.map((m) => (m.id === meetingId ? { ...m, status: 'noshow' as const } : m)),
      )
      showToast(MEETING_NOSHOW)
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
        showToast(PROMOTE_NOTE_REQUIRED)
        return
      }
      const current = disciples.find((d) => d.id === discipleId)
      const promotedTo = current ? nextStage(current.stage) : null
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
      showToast(promotedToast(promotedTo))
    },
    [disciples, masterChecklists, showToast],
  )

  const reassignDisciples = useCallback(
    (ids: Array<string>, toDisciplerId: string, circleId?: string | null) => {
      // No circle chosen: keep a circle only when the new discipler leads it.
      const ledByTarget = new Set(
        lifeGroups.filter((g) => g.leaderDisciplerId === toDisciplerId).map((g) => g.id),
      )
      setDisciples((prev) =>
        prev.map((d) =>
          ids.includes(d.id)
            ? {
                ...d,
                disciplerId: toDisciplerId,
                lifeGroupId:
                  circleId ?? (ledByTarget.has(d.lifeGroupId) ? d.lifeGroupId : ''),
              }
            : d,
        ),
      )
      // Same wording as the live path (reassignOutcome).
      showToast(`${disciplesLabel(ids.length)} reassigned.`)
    },
    [showToast, lifeGroups],
  )

  const newDemoDisciple = useCallback(
    (
      id: string,
      name: string,
      stage: Stage,
      circleId: string | null | undefined,
    ): Disciple => ({
      id,
      name,
      stage,
      days: 0,
      disciplerId: CURRENT_DISCIPLER_ID,
      // '' = no circle (the seed type keeps lifeGroupId a plain string)
      lifeGroupId:
        circleId === undefined
          ? (DISCIPLERS.find((x) => x.id === CURRENT_DISCIPLER_ID)
              ?.lifeGroupId ?? 'tribes')
          : (circleId ?? ''),
      cohort: '',
      inStageLabel: 'Just joined',
      lastSeen: 'Joined today',
      attendance: Array.from({ length: 12 }, () => false),
      checklist: masterChecklists[stage].map((text) => ({ text, done: false })),
      milestones: [],
      timeline: [
        { kind: 'stage', title: 'Joined Agapay', dateLabel: fmtShort(today()) },
      ],
    }),
    [masterChecklists],
  )

  const linkDisciple = useCallback(
    (memberId: string, circleId?: string | null) => {
      const member = directoryExtra.find((m) => m.id === memberId)
      if (!member) {
        showToast('Already walks with a discipler.')
        return
      }
      setDirectoryExtra((prev) => prev.filter((m) => m.id !== memberId))
      setDisciples((prev) => [
        newDemoDisciple(member.id, member.name, member.stage, circleId),
        ...prev,
      ])
      setSheet(null)
      showToast(addedToast(member.name, null))
    },
    [directoryExtra, newDemoDisciple, showToast],
  )

  const addNewDisciple = useCallback(
    (name: string, stage: Stage, circleId?: string | null) => {
      const clean = name.trim()
      setDisciples((prev) => [
        newDemoDisciple(`new-${Date.now()}`, clean, stage, circleId),
        ...prev,
      ])
      setSheet(null)
      showToast(addedToast(clean, null))
    },
    [newDemoDisciple, showToast],
  )

  const createCircle = useCallback(
    (name: string): string | null => {
      const clean = name.trim()
      const taken = lifeGroups.some(
        (g) => g.name.trim().toLowerCase() === clean.toLowerCase(),
      )
      if (taken) {
        showToast('Quest Circle name already in use.')
        return null
      }
      const id = `circle-${Date.now()}`
      setLifeGroups((prev) => [
        ...prev,
        {
          id,
          name: clean,
          satellite: 'Quest Laguna Main',
          leaderDisciplerId: CURRENT_DISCIPLER_ID,
        },
      ])
      showToast('Quest Circle started.')
      return id
    },
    [lifeGroups, showToast],
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
      lifeGroups,
      directoryExtra,
      currentDisciplerId: CURRENT_DISCIPLER_ID,
      adminName: ADMIN_NAME,
      toast,
      sheet,
      adminDetailId,
      openAdminDetail,
      closeAdminDetail,
      openSheet,
      closeSheet,
      closeSheetIf,
      showToast,
      logActivity,
      scheduleMeeting,
      completeMeeting,
      cancelMeeting,
      noshowMeeting,
      toggleChecklistItem,
      promoteDisciple,
      reassignDisciples,
      linkDisciple,
      addNewDisciple,
      createCircle,
      addMasterItem,
      removeMasterItem,
      moveMasterItem,
    }),
    [
      disciples,
      meetings,
      masterChecklists,
      lifeGroups,
      directoryExtra,
      toast,
      sheet,
      adminDetailId,
      openAdminDetail,
      closeAdminDetail,
      openSheet,
      closeSheet,
      closeSheetIf,
      showToast,
      logActivity,
      scheduleMeeting,
      completeMeeting,
      cancelMeeting,
      noshowMeeting,
      toggleChecklistItem,
      promoteDisciple,
      reassignDisciples,
      linkDisciple,
      addNewDisciple,
      createCircle,
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
