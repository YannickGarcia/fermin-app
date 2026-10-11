'use client';
/**
 * In-memory store for the prototype. Every mutation goes through an action
 * that returns a new Dataset, so undo is a stack of previous datasets.
 * The Supabase version keeps the same action names (see docs/SPEC.md §9):
 * each action becomes one RPC / server action.
 */
import {useMemo, useSyncExternalStore} from 'react';
import type {
  ClassTemplate, Coach, Court, Dataset, Enrollment, Family, ISODate, Level, Location, MakeupCredit, MakeupReason,
  SessionOverride, Student,
} from '../domain/types';
import {addDays, weekdayOf} from '../dates';
import {buildDataset} from './seed';

type State = {data: Dataset; past: Dataset[]};
let state: State = {data: buildDataset(), past: []};
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const getSnapshot = () => state;

function commit(next: Dataset) {
  state = {data: next, past: [...state.past.slice(-30), state.data]};
  listeners.forEach(l => l());
}
export function undo(): boolean {
  if (state.past.length === 0) return false;
  state = {data: state.past[state.past.length - 1], past: state.past.slice(0, -1)};
  listeners.forEach(l => l());
  return true;
}
/** Runs several actions as one step, so a single undo reverts all of them. */
export function transaction(fn: () => void) {
  const before = state;
  fn();
  if (state !== before) {
    state = {data: state.data, past: [...before.past.slice(-30), before.data]};
    listeners.forEach(l => l());
  }
}
export const getData = () => state.data;
export function useData(): Dataset {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).data;
}

let counter = 0;
const uid = (p: string) => `${p}-n${++counter}`;

// ── Read helpers ───────────────────────────────────────────────────────────
export interface Index {
  student: Map<string, Student>;
  family: Map<string, Family>;
  cls: Map<string, ClassTemplate>;
  court: Map<string, Court>;
  coach: Map<string, Coach>;
  location: Map<string, Location>;
  familyMembers: Map<string, Student[]>;
  enrollmentsByClass: Map<string, Enrollment[]>;
  enrollmentsByStudent: Map<string, Enrollment[]>;
  override: Map<string, SessionOverride>;
}
export function buildIndex(d: Dataset): Index {
  const group = <T,>(arr: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of arr) {
      const k = key(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(x);
    }
    return m;
  };
  return {
    student: new Map(d.students.map(s => [s.id, s])),
    family: new Map(d.families.map(f => [f.id, f])),
    cls: new Map(d.classes.map(c => [c.id, c])),
    court: new Map(d.courts.map(c => [c.id, c])),
    coach: new Map(d.coaches.map(c => [c.id, c])),
    location: new Map(d.locations.map(l => [l.id, l])),
    familyMembers: group(d.students, s => s.familyId),
    enrollmentsByClass: group(d.enrollments, e => e.classId),
    enrollmentsByStudent: group(d.enrollments, e => e.studentId),
    override: new Map(d.overrides.map(o => [`${o.classId}|${o.date}`, o])),
  };
}
export function useIndex(d: Dataset): Index {
  return useMemo(() => buildIndex(d), [d]);
}

const activeOn = (e: Enrollment, date: ISODate) => e.from <= date && (e.to === null || e.to >= date);

/** Students with a weekly seat in the class on that date. */
export function enrolledOn(ix: Index, classId: string, date: ISODate): Student[] {
  return (ix.enrollmentsByClass.get(classId) ?? []).filter(e => activeOn(e, date)).map(e => ix.student.get(e.studentId)!);
}
export function classesOf(ix: Index, studentId: string, date: ISODate): ClassTemplate[] {
  return (ix.enrollmentsByStudent.get(studentId) ?? [])
    .filter(e => activeOn(e, date))
    .map(e => ix.cls.get(e.classId)!)
    .sort((a, b) => a.weekday - b.weekday || a.startHour - b.startHour);
}

export interface Session {
  cls: ClassTemplate;
  date: ISODate;
  coach: Coach;
  court: Court;
  isSubstitute: boolean;
  cancelled: SessionOverride['cancelled'];
  students: Student[];
  /** Students here on a make-up credit for this date only. */
  guests: Student[];
  absentIds: Set<string>;
  free: number;
  /** Levels present in the group, lowest first. More than one means a mixed group. */
  levels: Level[];
}
export function sessionOf(d: Dataset, ix: Index, cls: ClassTemplate, date: ISODate): Session {
  const o = ix.override.get(`${cls.id}|${date}`);
  const students = enrolledOn(ix, cls.id, date);
  const guests = d.credits
    .filter(c => c.status === 'booked' && c.bookedClassId === cls.id && c.bookedDate === date)
    .map(c => ix.student.get(c.studentId)!);
  const absentIds = new Set(d.absences.filter(a => a.classId === cls.id && a.date === date).map(a => a.studentId));
  return {
    cls,
    date,
    coach: ix.coach.get(o?.coachId ?? cls.coachId)!,
    court: ix.court.get(o?.courtId ?? cls.courtId)!,
    isSubstitute: !!o?.coachId && o.coachId !== cls.coachId,
    cancelled: o?.cancelled,
    students,
    guests,
    absentIds,
    free: Math.max(0, cls.capacity - students.length - guests.length),
    levels: [...new Set<Level>([cls.level, ...students.map(s => s.level ?? cls.level)])].sort(),
  };
}

// ── Actions ────────────────────────────────────────────────────────────────
function upsertOverride(d: Dataset, patch: SessionOverride): SessionOverride[] {
  const rest = d.overrides.filter(o => !(o.classId === patch.classId && o.date === patch.date));
  const prev = d.overrides.find(o => o.classId === patch.classId && o.date === patch.date);
  return [...rest, {...prev, ...patch}];
}

/** Gives a student weekly seats from a date onwards. */
export function enrollStudent(studentId: string, classIds: string[], from: ISODate) {
  const d = state.data;
  commit({
    ...d,
    students: d.students.map(s => (s.id === studentId ? {...s, status: 'active' as const} : s)),
    enrollments: [...d.enrollments, ...classIds.map(classId => ({id: uid('enr'), studentId, classId, from, to: null}))],
  });
}

/** Opens a new weekly class (used when no existing group fits a student). */
export function createClass(c: Omit<ClassTemplate, 'id'>): string {
  const d = state.data;
  const id = uid('cls');
  commit({...d, classes: [...d.classes, {...c, id}]});
  return id;
}

/** Moves weekly seats: the old seat ends the day before `from`. */
export function moveEnrollments(studentId: string, changes: Array<{fromClassId: string; toClassId: string}>, from: ISODate) {
  const d = state.data;
  const closing = new Set(changes.map(c => c.fromClassId));
  const before = addDays(from, -1);
  commit({
    ...d,
    enrollments: [
      ...d.enrollments
        .map(e => (e.studentId === studentId && closing.has(e.classId) && (e.to === null || e.to >= from) ? {...e, to: before} : e))
        .filter(e => e.to === null || e.to >= e.from),
      ...changes.map(c => ({id: uid('enr'), studentId, classId: c.toClassId, from, to: null})),
    ],
  });
}

export function setCoach(classId: string, coachId: string, scope: {kind: 'season'} | {kind: 'session'; date: ISODate}) {
  const d = state.data;
  if (scope.kind === 'season') {
    commit({...d, classes: d.classes.map(c => (c.id === classId ? {...c, coachId} : c))});
  } else {
    commit({...d, overrides: upsertOverride(d, {classId, date: scope.date, coachId})});
  }
}

/** True when the student has already earned the season's maximum of make-up credits. */
export function atCreditCap(d: Dataset, studentId: string): boolean {
  const cap = d.academy.makeupCapPerSeason;
  if (cap === null) return false;
  const {start, end} = d.academy.season;
  return d.credits.filter(c => c.studentId === studentId && c.originDate >= start && c.originDate <= end).length >= cap;
}

function creditsFor(d: Dataset, ix: Index, classId: string, date: ISODate, reason: MakeupReason): MakeupCredit[] {
  return enrolledOn(ix, classId, date)
    .filter(s => !d.credits.some(c => c.studentId === s.id && c.originClassId === classId && c.originDate === date))
    .filter(s => !atCreditCap(d, s.id))
    .map(s => ({
      id: uid('mk'), studentId: s.id, reason, originClassId: classId, originDate: date,
      status: 'open' as const, bookedClassId: null, bookedDate: null,
    }));
}

/** Cancels dated sessions for rain. Every enrolled student earns a make-up. Returns how many credits were created. */
export function cancelForRain(sessions: Array<{classId: string; date: ISODate}>): number {
  let d = state.data;
  const ix = buildIndex(d);
  let created = 0;
  for (const s of sessions) {
    const credits = creditsFor(d, ix, s.classId, s.date, 'weather');
    created += credits.length;
    d = {...d, overrides: upsertOverride(d, {classId: s.classId, date: s.date, cancelled: 'weather'}), credits: [...d.credits, ...credits]};
  }
  commit(d);
  return created;
}

export function restoreSession(classId: string, date: ISODate) {
  const d = state.data;
  commit({
    ...d,
    overrides: d.overrides.map(o => (o.classId === classId && o.date === date ? {...o, cancelled: undefined} : o)),
    credits: d.credits.filter(c => !(c.originClassId === classId && c.originDate === date && c.reason === 'weather' && c.status === 'open')),
  });
}

/** Records an absence. Only a medical absence with certificate earns a make-up. */
export function markAbsence(studentId: string, classId: string, date: ISODate, reason: 'medical' | 'other', certificate: boolean): boolean {
  const d = state.data;
  const earns = reason === 'medical' && certificate && !atCreditCap(d, studentId);
  commit({
    ...d,
    absences: [...d.absences.filter(a => !(a.studentId === studentId && a.classId === classId && a.date === date)), {id: uid('abs'), studentId, classId, date, reason, certificate}],
    credits: earns
      ? [...d.credits, {id: uid('mk'), studentId, reason: 'medical', originClassId: classId, originDate: date, status: 'open', bookedClassId: null, bookedDate: null}]
      : d.credits,
  });
  return earns;
}

export function clearAbsence(studentId: string, classId: string, date: ISODate) {
  const d = state.data;
  commit({
    ...d,
    absences: d.absences.filter(a => !(a.studentId === studentId && a.classId === classId && a.date === date)),
    credits: d.credits.filter(c => !(c.studentId === studentId && c.originClassId === classId && c.originDate === date && c.reason === 'medical' && c.status === 'open')),
  });
}

export function bookCredit(creditId: string, classId: string, date: ISODate) {
  const d = state.data;
  commit({...d, credits: d.credits.map(c => (c.id === creditId ? {...c, status: 'booked' as const, bookedClassId: classId, bookedDate: date} : c))});
}

export function updateAcademy(patch: Partial<Dataset['academy']>) {
  const d = state.data;
  commit({...d, academy: {...d.academy, ...patch}});
}

/** Last day a credit can be used, or null when credits never expire. */
export function creditExpiry(d: Dataset, c: MakeupCredit): ISODate | null {
  return d.academy.makeupExpiryDays === null ? null : addDays(c.originDate, d.academy.makeupExpiryDays);
}
export function isExpired(d: Dataset, c: MakeupCredit, today: ISODate): boolean {
  const until = creditExpiry(d, c);
  return c.status === 'open' && until !== null && until < today;
}

export const dateOfClassInWeek = (monday: ISODate, cls: ClassTemplate) => addDays(monday, cls.weekday - 1);
export {weekdayOf};
