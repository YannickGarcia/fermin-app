/**
 * Voice and text commands → ActionDraft.
 *
 * The pipeline is always: words → ActionDraft → preview → confirm → action.
 * Nothing is executed from text directly; the draft is what the manager
 * confirms, and it is what gets logged.
 *
 * Two interpreters fill the same `Slots`: the rules in this file (instant,
 * offline) and Jev (lib/voice/jev.ts), a model that answers typed questions
 * with calibrated probabilities. Either way `resolveSlots` checks the slots
 * against real data. See docs/SPEC.md §8.
 */
import type {ClassTemplate, Coach, Dataset, ISODate, Student, Weekday} from '../domain/types';
import {LEVEL_LABEL, WEEKDAY_LONG, hourLabel, joinY} from '../domain/labels';
import {type Index, classesOf, enrolledOn} from '../data/store';
import {addDays, weekdayOf} from '../dates';

export type ActionDraft =
  | {
      kind: 'move';
      student: Student;
      changes: Array<{from: ClassTemplate; to: ClassTemplate}>;
      keep: ClassTemplate[];
      issues: string[];
    }
  | {kind: 'focus'; student: Student}
  | {kind: 'coach'; cls: ClassTemplate; coach: Coach; previous: Coach; scope: 'session' | 'season'; date: ISODate; issues: string[]}
  | {kind: 'rain'; date: ISODate; locationId: string | null; sessions: Array<{classId: string; date: ISODate}>; students: number; issues: string[]}
  | {kind: 'ambiguous'; options: Student[]}
  | {kind: 'unknown'; hint: string};

export interface ParseContext {
  data: Dataset;
  ix: Index;
  weekMonday: ISODate;
  today: ISODate;
  /** Set when the manager picked one of several students with the same name. */
  studentId?: string;
}

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ').trim();

const DAY_WORDS: Record<string, Weekday> = {
  lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, sabados: 6, domingo: 7, domingos: 7,
  monday: 1, mondays: 1, tuesday: 2, tuesdays: 2, wednesday: 3, wednesdays: 3, thursday: 4, thursdays: 4,
  friday: 5, fridays: 5, saturday: 6, saturdays: 6, sunday: 7, sundays: 7,
  // common dictation slips
  thurdays: 4, thursay: 4, tuedsay: 2, wensday: 3,
};
const STOP = new Set(['de', 'del', 'a', 'al', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'por', 'para', 'con', 'the', 'to', 'from', 'and', 'on', 'of', 'at', 'in']);

function findStudents(ctx: ParseContext, tokens: string[], skip: Set<number>): Student[] {
  if (ctx.studentId) {
    const s = ctx.ix.student.get(ctx.studentId);
    return s ? [s] : [];
  }
  const words = tokens.filter((t, i) => !skip.has(i) && !STOP.has(t) && !(t in DAY_WORDS));
  const byFirst = ctx.data.students.filter(s => words.includes(norm(s.firstName)));
  if (byFirst.length <= 1) return byFirst;
  const narrowed = byFirst.filter(s => norm(s.lastName).split(' ').some(part => words.includes(part)));
  return narrowed.length ? narrowed : byFirst;
}

function parseHour(text: string): number | 'same' | null {
  if (/misma hora|mismo horario|same time|same hour/.test(text)) return 'same';
  const m = text.match(/(?:a las|a la|at)\s+(\d{1,2})(?::\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  return h < 12 ? h + 12 : h;
}

/**
 * What a sentence says, before it is checked against the calendar. Both
 * interpreters (the rules below and Jev in lib/voice/jev.ts) produce this
 * shape; `resolveSlots` turns it into an ActionDraft.
 */
export interface Slots {
  intent: 'move' | 'focus' | 'coach' | 'rain' | 'unknown';
  /** Students the sentence may refer to. More than one means "ask which". */
  studentIds: string[];
  coachId: string | null;
  /** Days the student leaves. Empty = not said (all current days are candidates). */
  fromDays: Weekday[];
  toDays: Weekday[];
  /** Any other single day the sentence names (the class to re-coach, the day to cancel). */
  day: Weekday | 'today' | 'tomorrow' | null;
  hour: number | 'same' | null;
  locationId: string | null;
  scope: 'session' | 'season';
  /** Plain-word notes on anything the interpreter was unsure about. */
  doubts: string[];
}

/** Rule-based slot extraction. Instant, offline, Spanish and English. */
export function extractSlots(input: string, ctx: ParseContext): Slots {
  const text = norm(input);
  const tokens = text.split(' ').filter(Boolean);
  const slots: Slots = {
    intent: 'unknown', studentIds: [], coachId: null, fromDays: [], toDays: [], day: null,
    hour: parseHour(text), locationId: ctx.data.locations.find(l => tokens.includes(norm(l.short)))?.id ?? null,
    scope: /siempre|temporada|definitiv|permanent|every week|all season/.test(text) ? 'season' : 'session',
    doubts: [],
  };
  if (tokens.length === 0) return slots;
  const mentions = tokens.map((t, i) => ({i, day: DAY_WORDS[t]})).filter(m => m.day);
  slots.day = /\b(hoy|today)\b/.test(text) ? 'today' : /\b(manana|tomorrow)\b/.test(text) ? 'tomorrow' : mentions[0]?.day ?? null;

  if (/\b(lluvia|llueve|rain)\b/.test(text) && /\b(cancela|cancelar|anula|suspende|cancel)\b/.test(text)) {
    slots.intent = 'rain';
    return slots;
  }
  if (/\b(pon|asigna|sustituye|entrenador|entrenadora|coach|profe|put|assign)\b/.test(text) && /\b(clase|class)\b/.test(text)) {
    const coachAt = tokens.findIndex(t => ctx.data.coaches.some(c => norm(c.firstName) === t));
    if (coachAt > -1) {
      slots.intent = 'coach';
      slots.coachId = ctx.data.coaches.find(c => norm(c.firstName) === tokens[coachAt])!.id;
      slots.studentIds = findStudents(ctx, tokens, new Set([coachAt])).map(s => s.id);
      return slots;
    }
  }

  slots.studentIds = findStudents(ctx, tokens, new Set()).map(s => s.id);
  const isMove = /\b(cambia|cambiar|mueve|mover|pasa|pasar|change|move|switch)\b/.test(text) || mentions.length > 0;
  if (isMove && mentions.length > 0) {
    slots.intent = 'move';
    // The pivot is the first "a / al / to" that comes after a weekday and before another weekday.
    let pivot = -1;
    for (let i = mentions[0].i + 1; i < tokens.length; i++) {
      if (['a', 'al', 'to'].includes(tokens[i]) && mentions.some(m => m.i > i)) {
        pivot = i;
        break;
      }
    }
    const hasFrom = pivot > -1 && mentions.some(m => m.i < pivot);
    slots.fromDays = hasFrom ? [...new Set(mentions.filter(m => m.i < pivot).map(m => m.day))] : [];
    slots.toDays = [...new Set((hasFrom ? mentions.filter(m => m.i > pivot) : mentions).map(m => m.day))];
  } else if (slots.studentIds.length) {
    slots.intent = 'focus';
  } else if (isMove) {
    slots.intent = 'move';
  }
  return slots;
}

function resolveMove(ctx: ParseContext, student: Student, slots: Slots): ActionDraft {
  const {ix, data, weekMonday} = ctx;
  const {fromDays, toDays, hour} = slots;
  const hasFrom = fromDays.length > 0;
  const current = classesOf(ix, student.id, weekMonday);
  const issues: string[] = [];

  if (current.length === 0) issues.push(`${student.firstName} todavía no tiene horario; asígnale uno desde «Sin asignar»`);
  if (toDays.length === 0) issues.push('No he entendido a qué días quieres cambiar');
  for (const d of fromDays) {
    if (!current.some(c => c.weekday === d)) issues.push(`${student.firstName} no tiene clase los ${WEEKDAY_LONG[d]}`);
  }

  const leavingPool = hasFrom ? current.filter(c => fromDays.includes(c.weekday)) : current;
  const keep = current.filter(c => toDays.includes(c.weekday) || !leavingPool.includes(c));
  const leaving = leavingPool.filter(c => !toDays.includes(c.weekday));
  const arriving = toDays.filter(d => !current.some(c => c.weekday === d));
  if (issues.length === 0 && leaving.length !== arriving.length) {
    issues.push(`Deja ${leaving.length} clase${leaving.length === 1 ? '' : 's'} y pide ${arriving.length}; revisa los días`);
  }

  const changes: Array<{from: ClassTemplate; to: ClassTemplate}> = [];
  leaving.forEach((from, i) => {
    const day = arriving[i];
    if (!day) return;
    const wanted = typeof hour === 'number' ? hour : from.startHour;
    const sameLevel = data.classes.filter(
      c => c.weekday === day && c.sport === from.sport && c.group === from.group && c.level === from.level,
    );
    const open = sameLevel.filter(c => enrolledOn(ix, c.id, weekMonday).length < c.capacity);
    const exact = open
      .filter(c => c.startHour === wanted)
      .sort((a, b) => Number(b.locationId === from.locationId) - Number(a.locationId === from.locationId))[0];
    if (exact) {
      changes.push({from, to: exact});
      return;
    }
    // No seat at the student's level: a small group of the level next to it will do (SPEC D18).
    const {enabled, maxGroupSize} = data.academy.mixLevels;
    const mixed = enabled
      ? data.classes
          .filter(c => c.weekday === day && c.startHour === wanted && c.sport === from.sport && c.group === from.group && Math.abs(c.level - from.level) === 1)
          .filter(c => enrolledOn(ix, c.id, weekMonday).length <= maxGroupSize)
          .sort((a, b) => Number(b.locationId === from.locationId) - Number(a.locationId === from.locationId))[0]
      : undefined;
    if (mixed) {
      changes.push({from, to: mixed});
      return;
    }
    const what = `grupo de ${LEVEL_LABEL[from.level].toLowerCase()} los ${WEEKDAY_LONG[day]} a las ${hourLabel(wanted)}`;
    if (sameLevel.some(c => c.startHour === wanted)) issues.push(`El ${what} está completo`);
    else issues.push(`No hay ${what}`);
    const alt = open.sort((a, b) => Math.abs(a.startHour - wanted) - Math.abs(b.startHour - wanted))[0];
    if (alt) issues.push(`Hay plaza los ${WEEKDAY_LONG[day]} a las ${hourLabel(alt.startHour)} en ${ix.location.get(alt.locationId)!.short}`);
  });

  return {kind: 'move', student, changes, keep, issues};
}

function resolveRain(ctx: ParseContext, slots: Slots): ActionDraft {
  const {data, ix, weekMonday, today} = ctx;
  const date: ISODate | null =
    slots.day === 'today' ? today : slots.day === 'tomorrow' ? addDays(today, 1) : slots.day ? addDays(weekMonday, slots.day - 1) : null;
  const locationId = slots.locationId;
  if (!date) return {kind: 'rain', date: today, locationId, sessions: [], students: 0, issues: ['Dime qué día: «cancela por lluvia el jueves»']};
  const wd = weekdayOf(date);
  const hit = data.classes.filter(c => {
    if (c.weekday !== wd || (locationId && c.locationId !== locationId)) return false;
    const o = ix.override.get(`${c.id}|${date}`);
    const court = ix.court.get(o?.courtId ?? c.courtId)!;
    return !court.covered && !o?.cancelled;
  });
  const issues = hit.length === 0 ? ['No hay clases al aire libre ese día'] : [];
  const students = hit.reduce((n, c) => n + enrolledOn(ix, c.id, date).length, 0);
  return {kind: 'rain', date, locationId, sessions: hit.map(c => ({classId: c.id, date})), students, issues};
}

function resolveCoach(ctx: ParseContext, student: Student, slots: Slots): ActionDraft {
  const {data, ix, weekMonday} = ctx;
  const coach = ix.coach.get(slots.coachId!)!;
  const day = typeof slots.day === 'number' ? slots.day : null;
  const mine = classesOf(ix, student.id, weekMonday);
  const cls = day ? mine.find(c => c.weekday === day) : mine[0];
  if (!cls) {
    return {kind: 'unknown', hint: day ? `${student.firstName} no tiene clase los ${WEEKDAY_LONG[day]}` : `${student.firstName} no tiene clases`};
  }
  const issues: string[] = [];
  if (!coach.sports.includes(cls.sport)) issues.push(`${coach.firstName} no da clases de este deporte`);
  const clash = data.classes.find(c => c.id !== cls.id && c.coachId === coach.id && c.weekday === cls.weekday && c.startHour === cls.startHour);
  if (clash) issues.push(`${coach.firstName} ya tiene clase a esa hora en ${ix.location.get(clash.locationId)!.short}`);
  if (cls.coachId === coach.id) issues.push(`${coach.firstName} ya da esa clase`);
  return {kind: 'coach', cls, coach, previous: ix.coach.get(cls.coachId)!, scope: slots.scope, date: addDays(weekMonday, cls.weekday - 1), issues};
}

/** Checks slots against the calendar. This is the only way to get an ActionDraft. */
export function resolveSlots(slots: Slots, ctx: ParseContext): ActionDraft {
  if (slots.intent === 'rain') return resolveRain(ctx, slots);
  const ids = ctx.studentId ? [ctx.studentId] : slots.studentIds;
  const students = ids.map(id => ctx.ix.student.get(id)).filter((s): s is Student => !!s);
  if (slots.intent === 'coach' && slots.coachId && ctx.ix.coach.has(slots.coachId)) {
    if (students.length > 1) return {kind: 'ambiguous', options: students.slice(0, 6)};
    if (!students[0]) return {kind: 'unknown', hint: 'Dime de quién es la clase: «pon a Marta en la clase de Sarah del martes»'};
    return resolveCoach(ctx, students[0], slots);
  }
  if (students.length === 0) {
    return {kind: 'unknown', hint: slots.intent === 'move' ? 'No encuentro a ese alumno. Escribe su nombre como aparece en la ficha.' : ''};
  }
  if (students.length > 1) return {kind: 'ambiguous', options: students.slice(0, 6)};
  if (slots.intent === 'move') return resolveMove(ctx, students[0], slots);
  return {kind: 'focus', student: students[0]};
}

export function parseCommand(input: string, ctx: ParseContext): ActionDraft {
  return resolveSlots(extractSlots(input, ctx), ctx);
}

/** One-line, human description of a draft; also what gets read back by voice. */
export function describeDraft(d: ActionDraft, ix: Index): string {
  switch (d.kind) {
    case 'move': {
      if (d.changes.length === 0) return `Cambiar el horario de ${d.student.firstName}`;
      const after = [...d.keep, ...d.changes.map(c => c.to)].sort((a, b) => a.weekday - b.weekday);
      return `${d.student.firstName} pasa a ${joinY(after.map(c => `${WEEKDAY_LONG[c.weekday]} ${hourLabel(c.startHour)}`))}`;
    }
    case 'coach':
      return `${d.coach.firstName} da la clase del ${WEEKDAY_LONG[d.cls.weekday]} a las ${hourLabel(d.cls.startHour)} ${d.scope === 'season' ? 'toda la temporada' : 'esta semana'}`;
    case 'rain':
      return `Cancelar por lluvia ${d.sessions.length} clase${d.sessions.length === 1 ? '' : 's'} al aire libre${d.locationId ? ` en ${ix.location.get(d.locationId)!.short}` : ''}`;
    case 'focus':
      return `Ver a ${d.student.firstName} ${d.student.lastName} en el calendario`;
    default:
      return '';
  }
}

export interface PersonHit {
  kind: 'student' | 'coach';
  id: string;
  title: string;
  subtitle: string;
}
