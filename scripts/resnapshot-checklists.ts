/**
 * Re-apply the master checklists to disciples who are ALREADY enrolled.
 *
 *   pnpm exec node --experimental-strip-types scripts/resnapshot-checklists.ts
 *   ... --apply            # actually rewrites
 *   ... --apply --stage Newbie      # limit to one stage
 *
 * WHY THIS EXISTS
 * Editing a master checklist deliberately does NOT touch instances already in
 * progress (RULES.md #20) — nobody should have their journey rewritten
 * underneath them. That is right for day-to-day edits, but it means a
 * correction made just after import would never reach the people imported.
 * This script is the explicit, opt-in way to push corrected lists out.
 *
 * ⚠️ IT DISCARDS TICKED PROGRESS for the disciples it rewrites, because the
 * snapshot is replaced wholesale. The dry run tells you exactly how many ticks
 * would be lost before you commit.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const APPLY = process.argv.includes('--apply')
const stageArgIndex = process.argv.indexOf('--stage')
const ONLY_STAGE = stageArgIndex > -1 ? process.argv[stageArgIndex + 1] : null

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

async function main(): Promise<void> {
  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  console.log(APPLY ? '== APPLYING ==' : '== DRY RUN (pass --apply to write) ==')

  // PostgREST cannot embed across schemas (disciple_profiles lives in
  // `discipleship`, members in `public`), so fetch both and join here.
  const { data: enrolledData, error: enrolledError } = await db
    .schema('discipleship')
    .from('disciple_profiles')
    .select('id, member_id')
  if (enrolledError) throw enrolledError

  const { data: memberData, error: memberError } = await db
    .from('members')
    .select('id, name, discipleship_stage')
  if (memberError) throw memberError

  const memberById = new Map(
    (memberData as Array<{ id: string; name: string; discipleship_stage: string }>).map(
      (m) => [m.id, m],
    ),
  )

  interface Row {
    id: string
    member_id: string
    members: { name: string; discipleship_stage: string } | null
  }
  const rows: Array<Row> = (
    enrolledData as Array<{ id: string; member_id: string }>
  ).map((r) => ({
    id: r.id,
    member_id: r.member_id,
    members: memberById.get(r.member_id) ?? null,
  }))

  const targets = rows.filter(
    (r) => r.members && (!ONLY_STAGE || r.members.discipleship_stage === ONLY_STAGE),
  )

  // how much ticked progress would be discarded?
  const { count: tickedCount } = await db
    .schema('discipleship')
    .from('disciple_checklist_items')
    .select('id', { count: 'exact', head: true })
    .eq('done', true)

  console.log(`enrolled disciples          : ${rows.length}`)
  console.log(`in scope${ONLY_STAGE ? ` (${ONLY_STAGE})` : ''}                   : ${targets.length}`)
  console.log(`ticked items that exist now : ${tickedCount ?? 0}  ← these are DISCARDED`)

  if (!APPLY) {
    console.log('\nDry run complete — nothing was written.')
    return
  }

  let ok = 0
  for (const r of targets) {
    const { error } = await db.schema('discipleship').rpc('snapshot_checklist', {
      p_disciple: r.id,
      p_stage_db: r.members?.discipleship_stage,
    })
    if (error) {
      console.error(`  FAILED ${r.members?.name}: ${error.message}`)
      continue
    }
    ok += 1
  }
  console.log(`\nRe-snapshotted ${ok} of ${targets.length}.`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
