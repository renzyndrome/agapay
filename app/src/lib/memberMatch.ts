/** Directory search for the "Add a disciple" flow: plain name matches plus
 *  suggestions for nicknames, initials and typos. The same rules as the church
 *  directory app's staff check-in search, kept pure so they are unit-tested.
 *  Runs in the browser over the members a signed-in user may already read. */

export interface NamedMember {
  id: string
  name: string
}

export type SuggestionReason = 'initials' | 'surname' | 'similar'

export interface Suggestion<T extends NamedMember> {
  member: T
  reasons: Array<SuggestionReason>
  score: number
}

/** Lowercase, strip accents and punctuation, collapse spaces.
 *  "José  Cruz-Reyes!" → "jose cruz reyes". */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensOf(name: string): Array<string> {
  const n = normalizeName(name)
  return n ? n.split(' ') : []
}

/** Token-set confidence (0..1) that two names are the same person:
 *  1 identical, 0.97 same tokens, 0.9 one is a subset sharing 2+ tokens
 *  (dropped middle name), else the Dice coefficient over the token sets. */
export function nameMatchConfidence(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const setA = new Set(na.split(' '))
  const setB = new Set(nb.split(' '))
  let shared = 0
  for (const t of setA) if (setB.has(t)) shared++
  if (shared === setA.size && shared === setB.size) return 0.97
  if (shared >= 2 && (shared === setA.size || shared === setB.size)) return 0.9
  return (2 * shared) / (setA.size + setB.size)
}

function trigrams(name: string): Set<string> {
  const out = new Set<string>()
  for (const word of tokensOf(name)) {
    const padded = `  ${word} `
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3))
  }
  return out
}

/** Postgres pg_trgm-style similarity (0..1): shared word trigrams over all
 *  trigrams. Catches typos such as "Jhon Smit" → "John Smith". */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a)
  const tb = trigrams(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / (ta.size + tb.size - shared)
}

/** Plain name search: every typed token appears in the name, any order.
 *  Ranked exact, then starts-with, then the rest; alphabetical within. */
export function searchByName<T extends NamedMember>(
  query: string,
  members: ReadonlyArray<T>,
  limit = 8,
): Array<T> {
  const q = normalizeName(query)
  if (!q) return []
  const tokens = q.split(' ')
  const rank = (name: string) => (name === q ? 0 : name.startsWith(q) ? 1 : 2)
  return members
    .map((m) => ({ m, name: normalizeName(m.name) }))
    .filter(({ name }) => tokens.every((t) => name.includes(t)))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ m }) => m)
}

/** Leading initials of a typed name: "JC", "J.C.", or 3 consonants ("MJC").
 *  Null when the first word is an ordinary name. */
export function splitInitials(
  typed: string,
): { initials: string; rest: Array<string> } | null {
  const tokens = tokensOf(typed)
  const first = tokens[0] ?? ''
  if (/^[a-z]{2}$/.test(first) || /^[b-df-hj-np-tv-z]{3}$/.test(first)) {
    return { initials: first, rest: tokens.slice(1) }
  }
  let n = 0
  while (n < tokens.length && n < 3 && /^[a-z]$/.test(tokens[n])) n++
  if (n >= 2)
    return { initials: tokens.slice(0, n).join(''), rest: tokens.slice(n) }
  return null
}

/** Members whose leading names start with the typed initials and whose name
 *  holds every other typed word: "JC Cruz" → "Juan Carlos Cruz". */
export function findInitialsMatches<T extends NamedMember>(
  typed: string,
  members: ReadonlyArray<T>,
): Array<T> {
  const split = splitInitials(typed)
  if (!split) return []
  const letters = [...split.initials]
  return members.filter((m) => {
    const parts = tokensOf(m.name)
    return (
      parts.length >= letters.length + (split.rest.length > 0 ? 1 : 0) &&
      letters.every((l, i) => parts[i]?.[0] === l) &&
      split.rest.every((t) => parts.slice(letters.length).includes(t))
    )
  })
}

/** Members sharing the typed surname (last word, 3+ letters). Catches
 *  nicknames: "Bong Dela Cruz" → "Ramon Dela Cruz". */
export function findSurnameMatches<T extends NamedMember>(
  typed: string,
  members: ReadonlyArray<T>,
): Array<T> {
  const tokens = tokensOf(typed)
  const surname = tokens[tokens.length - 1] ?? ''
  if (tokens.length < 2 || surname.length < 3) return []
  return members.filter((m) => tokensOf(m.name).includes(surname))
}

const SIMILAR_THRESHOLD = 0.3
const INITIALS_WITH_NAME_SCORE = 0.85
const INITIALS_ONLY_SCORE = 0.6

/** Suggested members for a search that found few plain matches: initials,
 *  same surname, and look-alike spellings. Members in `excludeIds` (already
 *  listed as results) are skipped. Best score first; ties prefer the typed
 *  first initial, then the name. */
export function suggestMembers<T extends NamedMember>(
  query: string,
  members: ReadonlyArray<T>,
  excludeIds: ReadonlySet<string>,
  limit = 6,
): Array<Suggestion<T>> {
  if (normalizeName(query).length < 2) return []
  const found = new Map<string, Suggestion<T>>()
  const add = (member: T, reason: SuggestionReason, base: number) => {
    if (excludeIds.has(member.id)) return
    const prev = found.get(member.id)
    const score = Math.max(
      base,
      nameMatchConfidence(query, member.name),
      prev?.score ?? 0,
    )
    const reasons = prev?.reasons.includes(reason)
      ? prev.reasons
      : [...(prev?.reasons ?? []), reason]
    found.set(member.id, { member, reasons, score })
  }

  const initialsScore =
    (splitInitials(query)?.rest.length ?? 0) > 0
      ? INITIALS_WITH_NAME_SCORE
      : INITIALS_ONLY_SCORE
  for (const m of findInitialsMatches(query, members))
    add(m, 'initials', initialsScore)
  for (const m of findSurnameMatches(query, members)) add(m, 'surname', 0)
  // Look-alike spelling tags only members no other rule found (a surname
  // match already explains itself); it still lifts their score.
  for (const m of members) {
    const sim = trigramSimilarity(query, m.name)
    if (sim < SIMILAR_THRESHOLD) continue
    const prev = found.get(m.id)
    if (prev) found.set(m.id, { ...prev, score: Math.max(prev.score, sim) })
    else add(m, 'similar', sim)
  }

  const initial = normalizeName(query)[0]
  const otherInitial = (s: Suggestion<T>) =>
    normalizeName(s.member.name)[0] === initial ? 0 : 1
  return [...found.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        otherInitial(a) - otherInitial(b) ||
        a.member.name.localeCompare(b.member.name),
    )
    .slice(0, limit)
}
