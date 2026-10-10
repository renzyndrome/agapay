/**
 * Agapay member import (Phase 6, step 2).
 *
 *   pnpm tsx scripts/import-disciples.ts              # DRY RUN (default)
 *   pnpm tsx scripts/import-disciples.ts --apply      # actually writes
 *
 * Enrols every directory member who already has a `discipler_id` into
 * `discipleship.disciple_profiles`, backfills a "Joined Agapay" stage
 * transition, and snapshots their current stage's checklist.
 *
 * SAFETY
 *  - Dry run unless --apply is passed. The dry run is READ ONLY.
 *  - Idempotent: re-running skips anyone already enrolled, so a partial run can
 *    simply be repeated.
 *  - Touches ONLY the `discipleship` schema. It never writes to public.members
 *    or any other directory table (the prime directive).
 *  - Requires SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS — this is why the
 *    key lives server-side only and must never be exposed as a VITE_* var.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const APPLY = process.argv.includes('--apply')

/** Reads .env from the working directory or any parent, so the script runs the
 *  same from the repo root or from app/. */
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>
  let dir = process.cwd()
  for (let depth = 0; depth < 4; depth += 1) {
    try {
      const raw = readFileSync(resolve(dir, '.env'), 'utf8')
      for (const line of raw.split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
        if (m && !out[m[1]]) out[m[1]] = m[2]
      }
      break
    } catch {
      dir = resolve(dir, '..')
    }
  }
  return out
}

interface MemberRow {
  id: string
  name: string
  discipleship_stage: string
  discipler_id: string | null
  joined_date: string | null
}

/** "Q2 2026" from a joined_date, so cohorts exist without manual data entry. */
function cohortOf(joined: string | null): string | null {
  if (!joined) return null
  const d = new Date(joined)
  if (Number.isNaN(d.getTime())) return null
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
}

async function main(): Promise<void> {
  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  console.log(APPLY ? '== APPLYING ==' : '== DRY RUN (pass --apply to write) ==')

  const { data: memberData, error: memberError } = await db
    .from('members')
    .select('id, name, discipleship_stage, discipler_id, joined_date')
    .not('discipler_id', 'is', null)
    .eq('is_archived', false)
  if (memberError) throw memberError
  const members: Array<MemberRow> = memberData

  const { data: existingData, error: existingError } = await db
    .schema('discipleship')
    .from('disciple_profiles')
    .select('member_id')
  if (existingError) {
    console.log(`directory members with a discipler : ${members.length}`)
    if (existingError.code === 'PGRST106') {
      throw new Error(
        [
          'The `discipleship` schema is not exposed to the API yet, so nothing can be',
          'imported. Fix it first (one-time, ~30 seconds):',
          '',
          '  Supabase dashboard → Settings → API → Exposed schemas',
          '  → add "discipleship" → Save',
          '',
          'Then re-run this dry run. (The migrations must also be pushed first:',
          '  supabase db push)',
        ].join('\n'),
      )
    }
    throw existingError
  }
  const enrolled = new Set(
    (existingData as Array<{ member_id: string }>).map((r) => r.member_id),
  )

  const todo = members.filter((m) => !enrolled.has(m.id))

  const byStage = todo.reduce<Record<string, number>>((acc, m) => {
    acc[m.discipleship_stage] = (acc[m.discipleship_stage] ?? 0) + 1
    return acc
  }, {})
  const disciplers = new Set(todo.map((m) => m.discipler_id))

  console.log(`directory members with a discipler : ${members.length}`)
  console.log(`already enrolled                   : ${enrolled.size}`)
  console.log(`to enrol now                       : ${todo.length}`)
  console.log(`  by stage                         : ${JSON.stringify(byStage)}`)
  console.log(`distinct disciplers involved       : ${disciplers.size}`)

  if (!APPLY) {
    console.log('\nDry run complete — nothing was written.')
    console.log(todo.slice(0, 5).map((m) => `  would enrol: ${m.name}`).join('\n'))
    return
  }

  let ok = 0
  for (const m of todo) {
    const { data: inserted, error: insertError } = await db
      .schema('discipleship')
      .from('disciple_profiles')
      .insert({ member_id: m.id, cohort: cohortOf(m.joined_date) })
      .select('id')
      .single()
    if (insertError) {
      console.error(`  FAILED ${m.name}: ${insertError.message}`)
      continue
    }
    const discipleId = (inserted as { id: string }).id

    const { error: transitionError } = await db
      .schema('discipleship')
      .from('stage_transitions')
      .insert({
        disciple_id: discipleId,
        from_stage: null,
        to_stage: m.discipleship_stage,
        note: 'Joined Agapay (imported from the church directory)',
      })
    if (transitionError) console.error(`  audit row failed for ${m.name}`)

    const { error: snapshotError } = await db
      .schema('discipleship')
      .rpc('snapshot_checklist', {
        p_disciple: discipleId,
        p_stage_db: m.discipleship_stage,
      })
    if (snapshotError) console.error(`  checklist snapshot failed for ${m.name}`)

    ok += 1
  }

  console.log(`\nEnrolled ${ok} of ${todo.length}.`)
  console.log('Re-run safely at any time — already-enrolled members are skipped.')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
