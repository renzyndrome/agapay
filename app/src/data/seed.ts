import { addDays, fmtShort, today, toISODate } from '#/lib/format'
import type { Stage } from '#/lib/stages'

export type ActivityType =
  | 'One-on-one'
  | 'Life Group'
  | 'Sunday Service'
  | 'Prayer Meeting'
  | 'Note'

export const ACTIVITY_TYPES: ReadonlyArray<ActivityType> = [
  'One-on-one',
  'Life Group',
  'Sunday Service',
  'Prayer Meeting',
  'Note',
]

export type EventKind = 'activity' | 'meeting' | 'note' | 'check' | 'stage'

export interface TimelineEvent {
  kind: EventKind
  title: string
  dateLabel: string
  note?: string
}

export interface ChecklistItem {
  text: string
  done: boolean
}

export interface Milestone {
  title: string
  dateLabel: string | null
}

export interface Disciple {
  id: string
  name: string
  stage: Stage
  /** Prototype-only shortcut: the real app derives this from activity timestamps. */
  days: number
  disciplerId: string
  lifeGroupId: string
  cohort: string
  inStageLabel: string
  lastSeen: string
  attendance: Array<boolean>
  checklist: Array<ChecklistItem>
  milestones: Array<Milestone>
  timeline: Array<TimelineEvent>
}

export type MeetingMode = 'inperson' | 'online'
export type MeetingStatus = 'upcoming' | 'completed' | 'cancelled' | 'noshow'
export type Recurrence = 'none' | 'weekly' | 'biweekly'

export interface Meeting {
  id: string
  discipleId: string
  dateISO: string
  time: string // "19:00"
  durationMin: number
  mode: MeetingMode
  place: string
  recurrence: Recurrence
  status: MeetingStatus
  note?: string
}

export interface Discipler {
  id: string
  name: string
  lifeGroupId: string
  /** Prototype-only: derived from the discipler's own activity logs in the real app. */
  lastLogDays: number
}

/** Quest Circle (life group) — mirrors Tierra's cell_groups. */
export interface LifeGroup {
  id: string
  name: string
  satellite: string
  leaderDisciplerId: string
}

export type MasterChecklists = Record<Stage, Array<string>>

export const MASTER_CHECKLISTS: MasterChecklists = {
  'New Believer': [
    'Water baptism',
    'Complete One2One sessions (4)',
    'Attend Sunday service 4 weeks in a row',
    'Join a Life Group',
    'Receive first Bible',
    'Share testimony in Life Group',
  ],
  Growing: [
    'Complete Victory Weekend',
    'Serve in a ministry',
    'Build a daily devotion habit',
    'Complete doctrine classes',
    'Lead prayer in Life Group',
  ],
  Leader: [
    'Complete leadership training',
    'Facilitate a Life Group',
    'Begin discipling someone one-on-one',
    'Complete School of Discipleship',
  ],
}

/** Seeded from three live Quest Circles (Quest Laguna Main):
 *  TRIBES (Apple), CHOSEN GENERATION (Glenda), SOULDIERS (Ricardo).
 *  Glenda and Ricardo are themselves disciples inside TRIBES — Leaders who now
 *  disciple their own circles (the multiplication story).
 *  Current signed-in discipler persona = Apple Matabuena Eugenio. */
export const CURRENT_DISCIPLER_ID = 'apple'
export const ADMIN_NAME = 'Ptr. Dennis Ocampo'

export const LIFE_GROUPS: Array<LifeGroup> = [
  {
    id: 'tribes',
    name: 'TRIBES',
    satellite: 'Quest Laguna Main',
    leaderDisciplerId: 'apple',
  },
  {
    id: 'chosen',
    name: 'CHOSEN GENERATION',
    satellite: 'Quest Laguna Main',
    leaderDisciplerId: 'glenda',
  },
  {
    id: 'souldiers',
    name: 'SOULDIERS',
    satellite: 'Quest Laguna Main',
    leaderDisciplerId: 'ricardo',
  },
]

export const DISCIPLERS: Array<Discipler> = [
  {
    id: 'apple',
    name: 'Apple Matabuena Eugenio',
    lifeGroupId: 'tribes',
    lastLogDays: 0,
  },
  { id: 'judy', name: 'Judy Ann Ramos Bulao', lifeGroupId: 'tribes', lastLogDays: 18 },
  {
    id: 'glenda',
    name: 'Glenda Dizon Villanueva',
    lifeGroupId: 'chosen',
    lastLogDays: 3,
  },
  {
    id: 'ricardo',
    name: 'Ricardo II Siciban Manapat',
    lifeGroupId: 'souldiers',
    lastLogDays: 9,
  },
]

const T = today()

function mkChecklist(stage: Stage, doneCount: number): Array<ChecklistItem> {
  return MASTER_CHECKLISTS[stage].map((text, i) => ({ text, done: i < doneCount }))
}

function mkMilestones(achieved: number): Array<Milestone> {
  const defs = ['Salvation decision', 'First Life Group', 'Water baptism', 'First serve']
  return defs.map((title, i) => ({
    title,
    dateLabel: i < achieved ? fmtShort(addDays(T, -300 + i * 60)) : null,
  }))
}

function mkTimeline(days: number, lastSeen: string): Array<TimelineEvent> {
  const events: Array<TimelineEvent> = [
    {
      kind: 'activity',
      title: lastSeen.split(',')[0] ?? 'Activity',
      dateLabel: fmtShort(addDays(T, -days)),
    },
    {
      kind: 'meeting',
      title: 'One-on-one',
      dateLabel: fmtShort(addDays(T, -days - 16)),
      note: 'Good conversation about consistency.',
    },
    { kind: 'stage', title: 'Joined Agapay', dateLabel: fmtShort(addDays(T, -160)) },
  ]
  return events
}

interface SeedRow {
  id: string
  name: string
  stage: Stage
  days: number
  disciplerId: string
  /** defaults to 'tribes' */
  lifeGroupId?: string
  cohort: string
  inStageLabel: string
  activity: string
  chkDone: number
  milestones?: number
  attendance?: Array<number>
}

function mk(row: SeedRow): Disciple {
  const lastSeen = `${row.activity}, ${fmtShort(addDays(T, -row.days))}`
  const attend = (
    row.attendance ?? [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1]
  ).map((x) => x === 1)
  return {
    id: row.id,
    name: row.name,
    stage: row.stage,
    days: row.days,
    disciplerId: row.disciplerId,
    lifeGroupId: row.lifeGroupId ?? 'tribes',
    cohort: row.cohort,
    inStageLabel: row.inStageLabel,
    lastSeen,
    attendance: attend,
    checklist: mkChecklist(row.stage, row.chkDone),
    milestones: mkMilestones(row.milestones ?? 2),
    timeline: mkTimeline(row.days, lastSeen),
  }
}

export const DISCIPLES: Array<Disciple> = [
  // ── Apple's disciples ──
  mk({
    id: 'd1',
    name: 'Mary-Ann Caldoza',
    stage: 'Leader',
    days: 34,
    disciplerId: 'apple',
    cohort: '2025 Batch 2',
    inStageLabel: '4 months',
    activity: 'Life Group',
    chkDone: 1,
    attendance: [1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  }),
  mk({
    id: 'd2',
    name: 'Glaiza Eusebio Cordova',
    stage: 'Leader',
    days: 31,
    disciplerId: 'apple',
    cohort: 'Q1 2026',
    inStageLabel: '3 months',
    activity: 'Sunday Service',
    chkDone: 2,
    attendance: [1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0],
  }),
  mk({
    id: 'd3',
    name: 'Florence Zeezel Bom Bobis',
    stage: 'Growing',
    days: 21,
    disciplerId: 'apple',
    cohort: 'Q1 2026',
    inStageLabel: '5 months',
    activity: 'Life Group',
    chkDone: 2,
    milestones: 3,
  }),
  mk({
    id: 'd4',
    name: 'Ricardo II Siciban Manapat',
    stage: 'Leader',
    days: 16,
    disciplerId: 'apple',
    cohort: '2025 Batch 2',
    inStageLabel: '6 months',
    activity: 'Prayer Meeting',
    chkDone: 2,
  }),
  mk({
    id: 'd5',
    name: 'Ailene Garrote Estrellado',
    stage: 'Leader',
    days: 4,
    disciplerId: 'apple',
    cohort: 'Q1 2026',
    inStageLabel: '2 months',
    activity: 'Life Group',
    chkDone: 3,
    milestones: 4,
  }),
  mk({
    id: 'd6',
    name: 'Rowena Buisan Fernandez',
    stage: 'Leader',
    days: 6,
    disciplerId: 'apple',
    cohort: '2025 Batch 2',
    inStageLabel: '7 months',
    activity: 'Sunday Service',
    chkDone: 2,
  }),
  mk({
    id: 'd7',
    name: 'Jennylyn Roncesvalles Manganti',
    stage: 'Leader',
    days: 2,
    disciplerId: 'apple',
    cohort: 'Q2 2026',
    inStageLabel: '1 month',
    activity: 'One-on-one',
    chkDone: 1,
  }),
  mk({
    id: 'd8',
    name: 'Helen Gubalani Matuguina',
    stage: 'Leader',
    days: 9,
    disciplerId: 'apple',
    cohort: 'Q1 2026',
    inStageLabel: '3 months',
    activity: 'Life Group',
    chkDone: 3,
    milestones: 4,
  }),
  mk({
    id: 'd9',
    name: 'Aby Cruz',
    stage: 'Growing',
    days: 12,
    disciplerId: 'apple',
    cohort: 'Q2 2026',
    inStageLabel: '2 months',
    activity: 'Sunday Service',
    chkDone: 3,
  }),
  mk({
    id: 'd10',
    name: 'Alexies Aporillo Nacman',
    stage: 'Leader',
    days: 0,
    disciplerId: 'apple',
    cohort: 'Q1 2026',
    inStageLabel: '4 months',
    activity: 'One-on-one',
    chkDone: 2,
  }),
  mk({
    id: 'd11',
    name: 'Jovie Ann Anosa Nunes',
    stage: 'Leader',
    days: 13,
    disciplerId: 'apple',
    cohort: '2025 Batch 2',
    inStageLabel: '8 months',
    activity: 'Prayer Meeting',
    chkDone: 3,
    milestones: 4,
  }),
  // ── Judy Ann's disciples ──
  mk({
    id: 'd12',
    name: 'Chelzeiy Eusebio Cordova',
    stage: 'Growing',
    days: 41,
    disciplerId: 'judy',
    cohort: 'Q2 2026',
    inStageLabel: '6 weeks',
    activity: 'Sunday Service',
    chkDone: 1,
    attendance: [1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  }),
  mk({
    id: 'd13',
    name: 'Mary Grace Loza Palivino',
    stage: 'Leader',
    days: 19,
    disciplerId: 'judy',
    cohort: 'Q1 2026',
    inStageLabel: '5 months',
    activity: 'Life Group',
    chkDone: 2,
  }),
  mk({
    id: 'd14',
    name: 'Jon Lloyd Degasa Romero',
    stage: 'Leader',
    days: 26,
    disciplerId: 'judy',
    cohort: '2025 Batch 2',
    inStageLabel: '9 months',
    activity: 'Sunday Service',
    chkDone: 3,
  }),
  mk({
    id: 'd15',
    name: 'Erwin John Navarra Tuico',
    stage: 'Leader',
    days: 3,
    disciplerId: 'judy',
    cohort: 'Q1 2026',
    inStageLabel: '3 months',
    activity: 'Life Group',
    chkDone: 2,
  }),
  mk({
    id: 'd16',
    name: 'Lita Dizon Villanueva',
    stage: 'Leader',
    days: 7,
    disciplerId: 'judy',
    cohort: '2025 Batch 2',
    inStageLabel: '6 months',
    activity: 'Prayer Meeting',
    chkDone: 3,
    milestones: 4,
  }),
  mk({
    id: 'd17',
    name: 'April Micosa DA. Tuico',
    stage: 'Leader',
    days: 5,
    disciplerId: 'judy',
    cohort: 'Q2 2026',
    inStageLabel: '2 months',
    activity: 'Sunday Service',
    chkDone: 1,
  }),
  mk({
    id: 'd18',
    name: 'Glenda Dizon Villanueva',
    stage: 'Leader',
    days: 11,
    disciplerId: 'judy',
    cohort: 'Q1 2026',
    inStageLabel: '4 months',
    activity: 'Life Group',
    chkDone: 2,
  }),
  mk({
    id: 'd19',
    name: 'John Lerry Megino',
    stage: 'Leader',
    days: 1,
    disciplerId: 'judy',
    cohort: 'Q2 2026',
    inStageLabel: '1 month',
    activity: 'One-on-one',
    chkDone: 1,
  }),
  mk({
    id: 'd20',
    name: 'Jobelle Taoc Roncessvalles',
    stage: 'Leader',
    days: 8,
    disciplerId: 'judy',
    cohort: 'Q1 2026',
    inStageLabel: '3 months',
    activity: 'Sunday Service',
    chkDone: 2,
  }),
  mk({
    id: 'd21',
    name: 'Arielle Angelique B. Macaraeg',
    stage: 'Leader',
    days: 2,
    disciplerId: 'judy',
    cohort: 'Q2 2026',
    inStageLabel: '1 month',
    activity: 'Life Group',
    chkDone: 2,
  }),
  // ── CHOSEN GENERATION (Glenda's disciples) ──
  mk({
    id: 'c1',
    name: 'Ashlie Mae Constantino Hicana',
    stage: 'Leader',
    days: 4,
    disciplerId: 'glenda',
    lifeGroupId: 'chosen',
    cohort: 'Q2 2026',
    inStageLabel: '2 months',
    activity: 'Life Group',
    chkDone: 2,
  }),
  mk({
    id: 'c2',
    name: 'Cassandra Nicole C. Yuson',
    stage: 'Leader',
    days: 7,
    disciplerId: 'glenda',
    lifeGroupId: 'chosen',
    cohort: 'Q2 2026',
    inStageLabel: '3 months',
    activity: 'Sunday Service',
    chkDone: 3,
    milestones: 4,
  }),
  mk({
    id: 'c3',
    name: 'Elijah Krishane Constantino Hicana',
    stage: 'Leader',
    days: 12,
    disciplerId: 'glenda',
    lifeGroupId: 'chosen',
    cohort: 'Q2 2026',
    inStageLabel: '2 months',
    activity: 'Prayer Meeting',
    chkDone: 1,
  }),
  mk({
    id: 'c4',
    name: 'Rhuielyn Yuson',
    stage: 'Growing',
    days: 30,
    disciplerId: 'glenda',
    lifeGroupId: 'chosen',
    cohort: 'Q2 2026',
    inStageLabel: '6 weeks',
    activity: 'Sunday Service',
    chkDone: 1,
    attendance: [1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0],
  }),
  mk({
    id: 'c5',
    name: 'Rhian C. Hicana',
    stage: 'Leader',
    days: 2,
    disciplerId: 'glenda',
    lifeGroupId: 'chosen',
    cohort: 'Q2 2026',
    inStageLabel: '1 month',
    activity: 'One-on-one',
    chkDone: 2,
  }),
  mk({
    id: 'c6',
    name: 'Tyra Monteclaro',
    stage: 'Leader',
    days: 10,
    disciplerId: 'glenda',
    lifeGroupId: 'chosen',
    cohort: 'Q2 2026',
    inStageLabel: '2 months',
    activity: 'Life Group',
    chkDone: 2,
  }),
  mk({
    id: 'c7',
    name: 'Joyce Mendez Constantino',
    stage: 'Growing',
    days: 17,
    disciplerId: 'glenda',
    lifeGroupId: 'chosen',
    cohort: 'Q2 2026',
    inStageLabel: '2 months',
    activity: 'Life Group',
    chkDone: 2,
  }),
  mk({
    id: 'c8',
    name: 'Akiko Buisan Fernandez',
    stage: 'Growing',
    days: 6,
    disciplerId: 'glenda',
    lifeGroupId: 'chosen',
    cohort: 'Q2 2026',
    inStageLabel: '2 months',
    activity: 'Sunday Service',
    chkDone: 3,
  }),
  // ── SOULDIERS (Ricardo's disciples) ──
  mk({
    id: 's1',
    name: 'Sonny Degasa Romero Jr.',
    stage: 'Leader',
    days: 3,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q1 2026',
    inStageLabel: '4 months',
    activity: 'Life Group',
    chkDone: 3,
    milestones: 4,
  }),
  mk({
    id: 's2',
    name: 'John Carlo Remiendo Añonuevo',
    stage: 'Growing',
    days: 9,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q1 2026',
    inStageLabel: '3 months',
    activity: 'Sunday Service',
    chkDone: 2,
  }),
  mk({
    id: 's3',
    name: 'Jester Manganti Tungul',
    stage: 'Leader',
    days: 6,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q1 2026',
    inStageLabel: '4 months',
    activity: 'One-on-one',
    chkDone: 2,
  }),
  mk({
    id: 's4',
    name: 'Daniel Mandigma Tenefrancia',
    stage: 'Growing',
    days: 11,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q1 2026',
    inStageLabel: '2 months',
    activity: 'Life Group',
    chkDone: 3,
  }),
  mk({
    id: 's5',
    name: 'Andrei Joseph Balagtas',
    stage: 'Leader',
    days: 1,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q1 2026',
    inStageLabel: '5 months',
    activity: 'Prayer Meeting',
    chkDone: 3,
    milestones: 4,
  }),
  mk({
    id: 's6',
    name: 'Matthew Elamparo',
    stage: 'Growing',
    days: 22,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q2 2026',
    inStageLabel: '2 months',
    activity: 'Sunday Service',
    chkDone: 1,
  }),
  mk({
    id: 's7',
    name: 'Rhy Lee Ebueza Santos',
    stage: 'Growing',
    days: 8,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q2 2026',
    inStageLabel: '2 months',
    activity: 'Life Group',
    chkDone: 2,
  }),
  mk({
    id: 's8',
    name: 'Anjolito Cruz',
    stage: 'Growing',
    days: 36,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q2 2026',
    inStageLabel: '3 months',
    activity: 'Sunday Service',
    chkDone: 1,
    attendance: [1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
  }),
  mk({
    id: 's9',
    name: 'Prince Christian G. Concordia',
    stage: 'Growing',
    days: 13,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q2 2026',
    inStageLabel: '2 months',
    activity: 'Life Group',
    chkDone: 2,
  }),
  mk({
    id: 's10',
    name: 'Gil Dante Briones',
    stage: 'Leader',
    days: 5,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q1 2026',
    inStageLabel: '6 months',
    activity: 'One-on-one',
    chkDone: 2,
  }),
  mk({
    id: 's11',
    name: 'Ramon Jr. Dingding Santos',
    stage: 'Leader',
    days: 18,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q1 2026',
    inStageLabel: '5 months',
    activity: 'Sunday Service',
    chkDone: 2,
  }),
  mk({
    id: 's12',
    name: 'Alexander Jr. Pareja Bazar',
    stage: 'Growing',
    days: 2,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q2 2026',
    inStageLabel: '1 month',
    activity: 'Life Group',
    chkDone: 2,
  }),
  mk({
    id: 's13',
    name: 'Kier Musa',
    stage: 'Growing',
    days: 15,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q2 2026',
    inStageLabel: '6 weeks',
    activity: 'Sunday Service',
    chkDone: 1,
  }),
  mk({
    id: 's14',
    name: 'John Gilbert Ang',
    stage: 'New Believer',
    days: 5,
    disciplerId: 'ricardo',
    lifeGroupId: 'souldiers',
    cohort: 'Q2 2026',
    inStageLabel: '2 weeks',
    activity: 'Sunday Service',
    chkDone: 1,
    milestones: 1,
    attendance: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
  }),
]

/** Mary-Ann Caldoza carries a 2-meeting no-show streak on purpose (seed brief). */
export const MEETINGS: Array<Meeting> = [
  {
    id: 'm1',
    discipleId: 'd1',
    dateISO: toISODate(T),
    time: '19:00',
    durationMin: 60,
    mode: 'inperson',
    place: 'Kape Kada, Calamba',
    recurrence: 'none',
    status: 'upcoming',
  },
  {
    id: 'm2',
    discipleId: 'd3',
    dateISO: toISODate(addDays(T, 2)),
    time: '16:00',
    durationMin: 45,
    mode: 'online',
    place: 'Google Meet',
    recurrence: 'weekly',
    status: 'upcoming',
  },
  {
    id: 'm3',
    discipleId: 'd5',
    dateISO: toISODate(addDays(T, 3)),
    time: '11:30',
    durationMin: 30,
    mode: 'inperson',
    place: 'Quest Laguna Main',
    recurrence: 'none',
    status: 'upcoming',
  },
  {
    id: 'm4',
    discipleId: 'd1',
    dateISO: toISODate(addDays(T, -12)),
    time: '10:00',
    durationMin: 60,
    mode: 'inperson',
    place: 'Kape Kada, Calamba',
    recurrence: 'none',
    status: 'noshow',
  },
  {
    id: 'm5',
    discipleId: 'd1',
    dateISO: toISODate(addDays(T, -19)),
    time: '10:00',
    durationMin: 60,
    mode: 'inperson',
    place: 'Kape Kada, Calamba',
    recurrence: 'none',
    status: 'noshow',
  },
  {
    id: 'm6',
    discipleId: 'd10',
    dateISO: toISODate(addDays(T, -2)),
    time: '18:30',
    durationMin: 60,
    mode: 'inperson',
    place: 'Quest Laguna Main',
    recurrence: 'none',
    status: 'completed',
    note: 'Planned his first Life Group facilitation.',
  },
  {
    id: 'm7',
    discipleId: 'd8',
    dateISO: toISODate(addDays(T, -9)),
    time: '11:30',
    durationMin: 45,
    mode: 'inperson',
    place: 'Quest Laguna Main',
    recurrence: 'none',
    status: 'completed',
    note: 'Set her ministry serve schedule.',
  },
  {
    id: 'm8',
    discipleId: 'd11',
    dateISO: toISODate(addDays(T, -10)),
    time: '20:00',
    durationMin: 30,
    mode: 'online',
    place: 'Google Meet',
    recurrence: 'none',
    status: 'cancelled',
  },
]
