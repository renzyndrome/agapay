const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const DOWS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DOWS_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function today(): Date {
  return new Date()
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function fromISODate(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

/** "Jun 8" */
export function fmtShort(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** "Thu, Jul 10" */
export function fmtHeader(d: Date): string {
  return `${DOWS_LONG[d.getDay()]}, ${fmtShort(d)}`
}

/** "THU" */
export function fmtDow(d: Date): string {
  return DOWS[d.getDay()]
}

/** "7:00 PM" from "19:00" */
export function fmtTime12(hhmm: string): string {
  const [hs = '0', m = '00'] = hhmm.split(':')
  const h = parseInt(hs, 10)
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
}

/** "Today" | "Yesterday" | "N days ago" */
export function daysAgoLabel(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

/** "JD" from "Jomar Dela Cruz" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
