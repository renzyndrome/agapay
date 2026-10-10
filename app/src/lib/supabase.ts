import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabaseEnv = Boolean(url && anonKey)

/** Live auth requires BOTH credentials AND an explicit opt-out of demo mode.
 *  Defaulting to demo keeps the public prototype at discipleship.questlaguna.org
 *  working even after the Supabase env vars are added for later phases. */
export const isDemoMode = !(hasSupabaseEnv && import.meta.env.VITE_DEMO_MODE === 'false')

let client: SupabaseClient | null = null

/** Null in demo mode (or when env is missing) — callers must handle that. */
export function getSupabase(): SupabaseClient | null {
  if (!hasSupabaseEnv) return null
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}
