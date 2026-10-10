/** Directory members nobody walks with yet, for the demo "Add a disciple"
 *  search. Made-up names chosen to exercise the matching (initials, surname,
 *  typos); the live app reads the real church directory instead. */
import type { Stage } from '#/lib/stages'

export interface DemoMember {
  id: string
  name: string
  stage: Stage
  satelliteName: string
}

export const DEMO_UNASSIGNED: Array<DemoMember> = [
  {
    id: 'm-jcm',
    name: 'Juan Carlos Mendoza',
    stage: 'New Believer',
    satelliteName: 'Quest Laguna Main',
  },
  {
    id: 'm-kre',
    name: 'Katherine Reyes',
    stage: 'Growing',
    satelliteName: 'Quest Sta. Rosa',
  },
  {
    id: 'm-rdc',
    name: 'Ramon Dela Cruz',
    stage: 'New Believer',
    satelliteName: 'Quest Biñan',
  },
  {
    id: 'm-jga',
    name: 'Jennifer Garcia',
    stage: 'New Believer',
    satelliteName: 'Quest Laguna Main',
  },
  {
    id: 'm-pvi',
    name: 'Paolo Villareal',
    stage: 'Growing',
    satelliteName: 'Quest Laguna Main',
  },
  {
    id: 'm-msa',
    name: 'Maria Santos',
    stage: 'New Believer',
    satelliteName: 'Quest Sta. Rosa',
  },
]
