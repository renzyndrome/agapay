/** Every write the app performs, in one place.
 *
 *  Each hook returns a function with the SAME signature the seeded store used,
 *  so screens call it identically in both modes:
 *    • demo  → the in-memory store (the deployed prototype is unaffected)
 *    • live  → Supabase, then targeted query invalidation
 *
 *  Writes that touch the directory (promote, reassign) go exclusively through
 *  the security-definer RPCs — never a direct UPDATE on public.members.
 */
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAuth } from '#/auth'
import type { ActivityType, MeetingMode, Recurrence } from '#/data/seed'
import { memberIdOf } from '#/lib/auth'
import { friendlyDbError } from '#/lib/dbError'
import { isAfterDay } from '#/lib/format'
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
import { getSupabase, isDemoMode } from '#/lib/supabase'
import { nextStage, toDbStage } from '#/lib/stages'
import type { Stage } from '#/lib/stages'
import { movedCount, reassignOutcome } from '#/lib/reassignOutcome'
import { useStore } from '#/store'
import { useDisciples } from '#/features/disciples/hooks'
import { discipleKeys } from '#/features/disciples/queryKeys'
import { meetingKeys } from '#/features/meetings/queryKeys'
import { checklistKeys } from '#/features/checklists/queryKeys'
import { directoryKeys } from '#/features/directory/queryKeys'
import type { DiscipleSummary } from '#/features/types'

const SCHEMA = 'discipleship'

/** The queue must react the instant a check-in is saved (RULES #15), so we
 *  patch the cached row before the refetch lands. */
function markWalkedWith(qc: QueryClient, discipleId: string) {
  qc.setQueryData<Array<DiscipleSummary>>(discipleKeys.list(), (prev) =>
    prev?.map((d) =>
      d.id === discipleId ? { ...d, days: 0, engagement: 'green' as const } : d,
    ),
  )
}

async function refreshDisciple(qc: QueryClient, discipleId: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: discipleKeys.list() }),
    qc.invalidateQueries({ queryKey: discipleKeys.detail(discipleId) }),
  ])
}

interface LiveContext {
  supabase: SupabaseClient
  userId: string
}

function useLive(): LiveContext | null {
  const supabase = getSupabase()
  const { session } = useAuth()
  if (isDemoMode || !supabase || !session) return null
  return { supabase, userId: session.user.id }
}

// ── activities ──────────────────────────────────────────────────────────────

export function useLogActivity() {
  const store = useStore()
  const live = useLive()
  const qc = useQueryClient()
  const { data: disciples } = useDisciples('all')

  return useCallback(
    async (
      discipleId: string,
      type: ActivityType,
      dateISO: string,
      notes: string,
    ) => {
      // Client guard; a database guard is pending. The sheet stays open.
      if (isAfterDay(dateISO)) {
        store.showToast('Activity date in the future. Pick today or earlier.')
        return
      }
      if (!live) {
        store.logActivity(discipleId, type, dateISO, notes)
        return
      }
      const name = disciples.find((d) => d.id === discipleId)?.name ?? ''
      const sheetAtCall = store.sheet
      const { error } = await live.supabase
        .schema(SCHEMA)
        .from('activity_logs')
        .insert({
          disciple_id: discipleId,
          type,
          occurred_on: dateISO,
          note: notes.trim() || null,
          created_by: live.userId,
        })
      // A sheet opened meanwhile stays open.
      store.closeSheetIf(sheetAtCall)
      if (error) {
        store.showToast(friendlyDbError(error, 'Activity not saved. Retry.'))
        return
      }
      // Sunday Service is a group touchpoint: it never resets the clock.
      if (type !== 'Sunday Service') markWalkedWith(qc, discipleId)
      store.showToast(loggedToast(type, name))
      await refreshDisciple(qc, discipleId)
    },
    [live, store, qc, disciples],
  )
}

// ── meetings ────────────────────────────────────────────────────────────────

interface ScheduleInput {
  discipleId: string
  dateISO: string
  time: string
  durationMin: number
  mode: MeetingMode
  place: string
  recurrence: Recurrence
}

export function useScheduleMeeting() {
  const store = useStore()
  const live = useLive()
  const qc = useQueryClient()

  return useCallback(
    async (input: ScheduleInput) => {
      if (!live) {
        store.scheduleMeeting(input)
        return
      }
      const sheetAtCall = store.sheet
      const { error } = await live.supabase
        .schema(SCHEMA)
        .from('meetings')
        .insert({
          disciple_id: input.discipleId,
          scheduled_at: new Date(`${input.dateISO}T${input.time}:00`).toISOString(),
          duration_min: input.durationMin,
          mode: input.mode,
          place: input.place,
          recurrence: input.recurrence,
          created_by: live.userId,
        })
      store.closeSheetIf(sheetAtCall)
      if (error) {
        store.showToast(friendlyDbError(error, 'Meeting not scheduled. Retry.'))
        return
      }
      store.showToast(scheduledToast(input.recurrence))
      await qc.invalidateQueries({ queryKey: meetingKeys.all })
    },
    [live, store, qc],
  )
}

function useMeetingStatusChange() {
  const store = useStore()
  const live = useLive()
  const qc = useQueryClient()

  return useCallback(
    async (
      meetingId: string,
      status: 'completed' | 'cancelled' | 'noshow',
      note: string | null,
      toast: string,
    ) => {
      if (!live) return false
      const patch: Record<string, unknown> = { status }
      if (note !== null) patch.note = note.trim() || null
      const { error } = await live.supabase
        .schema(SCHEMA)
        .from('meetings')
        .update(patch)
        .eq('id', meetingId)
      if (error) {
        store.showToast(friendlyDbError(error, 'Meeting not updated. Retry.'))
        return true
      }
      store.showToast(toast)
      await qc.invalidateQueries({ queryKey: meetingKeys.all })
      await qc.invalidateQueries({ queryKey: discipleKeys.list() })
      return true
    },
    [live, store, qc],
  )
}

export function useCompleteMeeting() {
  const store = useStore()
  const live = useLive()
  const change = useMeetingStatusChange()

  return useCallback(
    async (meetingId: string, notes: string) => {
      if (!live) {
        store.completeMeeting(meetingId, notes)
        return
      }
      store.closeSheet()
      // the DB trigger stamps completed_at, which resets engagement
      await change(meetingId, 'completed', notes, MEETING_COMPLETED)
    },
    [live, store, change],
  )
}

export function useCancelMeeting() {
  const store = useStore()
  const live = useLive()
  const change = useMeetingStatusChange()
  return useCallback(
    async (meetingId: string) => {
      if (!live) {
        store.cancelMeeting(meetingId)
        return
      }
      await change(meetingId, 'cancelled', null, MEETING_CANCELLED)
    },
    [live, store, change],
  )
}

export function useNoshowMeeting() {
  const store = useStore()
  const live = useLive()
  const change = useMeetingStatusChange()
  return useCallback(
    async (meetingId: string) => {
      if (!live) {
        store.noshowMeeting(meetingId)
        return
      }
      await change(meetingId, 'noshow', null, MEETING_NOSHOW)
    },
    [live, store, change],
  )
}

// ── checklist ───────────────────────────────────────────────────────────────

export function useToggleChecklistItem() {
  const store = useStore()
  const live = useLive()
  const qc = useQueryClient()

  return useCallback(
    async (discipleId: string, itemId: string, index: number, nextDone: boolean) => {
      if (!live) {
        store.toggleChecklistItem(discipleId, index)
        return
      }
      const { error } = await live.supabase
        .schema(SCHEMA)
        .from('disciple_checklist_items')
        .update({ done: nextDone })
        .eq('id', itemId)
      if (error) {
        store.showToast(
          friendlyDbError(error, 'Checklist item not updated. Retry.'),
        )
        return
      }
      await refreshDisciple(qc, discipleId)
    },
    [live, store, qc],
  )
}

// ── promotion & assignment (directory writes — RPC only) ────────────────────

export function usePromoteDisciple() {
  const store = useStore()
  const live = useLive()
  const qc = useQueryClient()
  const { data: disciples } = useDisciples('all')

  return useCallback(
    async (discipleId: string, note: string) => {
      if (!live) {
        store.promoteDisciple(discipleId, note)
        return
      }
      if (!note.trim()) {
        store.showToast(PROMOTE_NOTE_REQUIRED)
        return
      }
      const stage = disciples.find((d) => d.id === discipleId)?.stage
      const sheetAtCall = store.sheet
      // The stage on screen goes along: if it changed meanwhile (another
      // device, a double tap), the database refuses instead of promoting twice.
      const { error } = await live.supabase
        .schema(SCHEMA)
        .rpc('promote_disciple', {
          p_disciple: discipleId,
          p_note: note,
          p_from_stage_db: stage ? toDbStage(stage) : null,
        })
      store.closeSheetIf(sheetAtCall)
      if (error) {
        store.showToast(friendlyDbError(error, 'Promotion not saved. Retry.'))
        await refreshDisciple(qc, discipleId)
        return
      }
      store.showToast(promotedToast(stage ? nextStage(stage) : null))
      await refreshDisciple(qc, discipleId)
    },
    [live, store, qc, disciples],
  )
}

/** Resolves true only when every requested disciple was moved, so the admin
 *  table keeps its selection after a refusal or a short move. */
export function useReassignDisciples() {
  const store = useStore()
  const live = useLive()
  const qc = useQueryClient()

  return useCallback(
    async (
      discipleIds: Array<string>,
      toDisciplerMemberId: string,
      circleId: string | null = null,
    ): Promise<boolean> => {
      if (!live) {
        store.reassignDisciples(discipleIds, toDisciplerMemberId, circleId)
        return true
      }
      // One transaction: discipler and Quest Circle change together, or
      // nothing changes. Without a circle, disciples leave circles the new
      // discipler does not run.
      const { data, error } = await live.supabase.schema(SCHEMA).rpc('reassign_disciples', {
        p_disciples: discipleIds,
        p_to_member: toDisciplerMemberId,
        p_circle: circleId,
      })
      if (error) {
        store.showToast(
          friendlyDbError(error, 'Reassign failed. Refresh and retry.'),
        )
        return false
      }
      const requested = discipleIds.length
      const moved = movedCount(data, requested)
      const outcome = reassignOutcome({ requested, moved, circleFailures: [] })
      store.showToast(outcome.toast)
      // The target may be a brand-new discipler: refresh the discipler list
      // and the directory too, not only the disciples.
      await refreshRosterQueries(qc)
      return outcome.complete
    },
    [live, store, qc],
  )
}

// ── master checklist (admin) ────────────────────────────────────────────────

/** One transactional RPC backs add / remove / reorder, so a failed edit can
 *  never leave a stage half-rewritten. */
function useSetMasterChecklist() {
  const store = useStore()
  const live = useLive()
  const qc = useQueryClient()

  return useCallback(
    async (stage: Stage, texts: Array<string>, toast: string) => {
      if (!live) return false
      const { error } = await live.supabase
        .schema(SCHEMA)
        .rpc('set_master_checklist', {
          p_stage_db: toDbStage(stage),
          p_texts: texts,
        })
      if (error) {
        store.showToast(friendlyDbError(error, 'Checklist not saved. Retry.'))
        return true
      }
      store.showToast(toast)
      await qc.invalidateQueries({ queryKey: checklistKeys.all })
      return true
    },
    [live, store, qc],
  )
}

export function useMasterChecklistEdits(current: Array<string>) {
  const store = useStore()
  const live = useLive()
  const setList = useSetMasterChecklist()

  const addItem = useCallback(
    async (stage: Stage, text: string) => {
      if (!live) {
        store.addMasterItem(stage, text)
        return
      }
      await setList(stage, [...current, text], 'Item added')
    },
    [live, store, setList, current],
  )

  const removeItem = useCallback(
    async (stage: Stage, index: number) => {
      if (!live) {
        store.removeMasterItem(stage, index)
        return
      }
      await setList(
        stage,
        current.filter((_, i) => i !== index),
        'Item removed',
      )
    },
    [live, store, setList, current],
  )

  const moveItem = useCallback(
    async (stage: Stage, from: number, to: number) => {
      if (!live) {
        store.moveMasterItem(stage, from, to)
        return
      }
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      await setList(stage, next, 'Checklist reordered')
    },
    [live, store, setList, current],
  )

  return { addItem, removeItem, moveItem }
}

// ── adding disciples (directory writes — RPC only) ──────────────────────────

async function refreshRosterQueries(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: discipleKeys.all }),
    qc.invalidateQueries({ queryKey: directoryKeys.all }),
  ])
}

/** Put a just-added disciple in a circle. The disciple is already saved, so
 *  a failure here only reports the circle. Returns null on success, else the
 *  reason fit to show ('' when the raw error is not product copy). */
async function placeInCircle(
  supabase: SupabaseClient,
  discipleId: string,
  circleId: string,
): Promise<string | null> {
  const { error } = await supabase
    .schema(SCHEMA)
    .rpc('place_in_circle', { p_disciple: discipleId, p_circle: circleId })
  return error ? friendlyDbError(error, '') : null
}

/** Take an existing directory member nobody walks with yet. Resolves true on
 *  success so the sheet can reset its busy state. circleId: a circle the
 *  discipler runs, or null for none. */
export function useLinkDisciple() {
  const store = useStore()
  const live = useLive()
  const qc = useQueryClient()
  const { role } = useAuth()
  // A discipler, or an admin who is also a member (the database allows both).
  const myMemberId = memberIdOf(role)

  return useCallback(
    async (
      member: { id: string; name: string },
      circleId: string | null = null,
    ): Promise<boolean> => {
      if (!live) {
        store.linkDisciple(member.id, circleId)
        return true
      }
      if (!myMemberId) {
        store.showToast('Only a discipler can add a disciple.')
        return false
      }
      const sheetAtCall = store.sheet
      const { data, error } = await live.supabase
        .schema(SCHEMA)
        .rpc('link_disciple', { p_member: member.id })
      if (error) {
        store.showToast(friendlyDbError(error, 'Disciple not added. Retry.'))
        // The row may be stale (taken meanwhile, or archived): re-read it so
        // its status shows why.
        await qc.invalidateQueries({ queryKey: directoryKeys.search() })
        return false
      }
      const circleError = circleId
        ? await placeInCircle(live.supabase, data as string, circleId)
        : null
      // Closes the add sheet only, never a sheet opened meanwhile.
      store.closeSheetIf(sheetAtCall)
      store.showToast(addedToast(member.name, circleError))
      await refreshRosterQueries(qc)
      return true
    },
    [live, store, qc, myMemberId],
  )
}

/** Add someone who is not in the directory yet (a new directory record plus
 *  enrollment). The sheet checks for similar names before calling this. */
export function useAddNewDisciple() {
  const store = useStore()
  const live = useLive()
  const qc = useQueryClient()
  const { role } = useAuth()
  // A discipler, or an admin who is also a member (the database allows both).
  const myMemberId = memberIdOf(role)

  return useCallback(
    async (
      name: string,
      stage: Stage,
      circleId: string | null = null,
    ): Promise<boolean> => {
      const clean = name.trim()
      if (clean.length < 2) {
        store.showToast('Full name required.')
        return false
      }
      if (!live) {
        store.addNewDisciple(clean, stage, circleId)
        return true
      }
      if (!myMemberId) {
        store.showToast('Only a discipler can add a disciple.')
        return false
      }
      const sheetAtCall = store.sheet
      const { data, error } = await live.supabase.schema(SCHEMA).rpc('add_disciple', {
        p_name: clean,
        p_city: null,
        p_stage_db: toDbStage(stage),
        p_discipler_member: myMemberId,
        p_cohort: null,
      })
      if (error) {
        store.showToast(friendlyDbError(error, 'Disciple not added. Retry.'))
        return false
      }
      const circleError = circleId
        ? await placeInCircle(live.supabase, data as string, circleId)
        : null
      // Closes the add sheet only, never a sheet opened meanwhile.
      store.closeSheetIf(sheetAtCall)
      store.showToast(addedToast(clean, circleError))
      await refreshRosterQueries(qc)
      return true
    },
    [live, store, qc, myMemberId],
  )
}

/** A discipler starts a Quest Circle they lead. Resolves the new circle id,
 *  or null when refused (the reason is shown as a toast). */
export function useCreateCircle() {
  const store = useStore()
  const live = useLive()
  const qc = useQueryClient()

  return useCallback(
    async (name: string): Promise<string | null> => {
      const clean = name.trim()
      if (clean.length < 2) {
        store.showToast('Quest Circle name required.')
        return null
      }
      if (!live) return store.createCircle(clean)
      const { data, error } = await live.supabase
        .schema(SCHEMA)
        .rpc('create_circle', { p_name: clean })
      if (error) {
        store.showToast(
          error.message.includes('already in use')
            ? 'Quest Circle name already in use.'
            : friendlyDbError(error, 'Quest Circle not started. Retry.'),
        )
        return null
      }
      // Wait for the refetch so the new circle can be selected at once. The
      // circle exists either way; the sheet keeps its id selected.
      const refreshed = await qc
        .invalidateQueries(
          { queryKey: directoryKeys.lifeGroups() },
          { throwOnError: true },
        )
        .then(
          () => true,
          () => false,
        )
      store.showToast(
        refreshed
          ? 'Quest Circle started.'
          : 'Quest Circle started. Circle list not refreshed.',
      )
      return data as string
    },
    [live, store, qc],
  )
}
