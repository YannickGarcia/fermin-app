/**
 * Auto-allocation: given an assessed student (sport, group, level), their
 * availability and how many classes a week they want, rank the weekly
 * combinations of existing classes that fit. Pure functions, no UI.
 *
 * Hard constraints: same sport and group · same level, or the level next to
 * it when the academy allows mixing and the group is small · weekday and hour inside
 * the student's availability · a free seat · one class per day.
 * Soft preferences (the score): home location, rest day between classes,
 * same hour every day, same location every day, siblings on site at the
 * same time, and filling groups that are already running.
 */
import type {ClassTemplate, Coach, Court, Dataset, ISODate, Student, Weekday} from '../domain/types';
import {LEVEL_LABEL, WEEKDAY_LONG, hourLabel, joinY} from '../domain/labels';
import {type Index, classesOf, enrolledOn} from '../data/store';

export interface Proposal {
  id: string;
  classes: ClassTemplate[];
  score: number;
  reasons: string[];
  /** True when fewer classes than the student asked for could be found. */
  partial: boolean;
}

export interface NewClassSlot {
  weekday: Weekday;
  startHour: number;
  court: Court;
  coach: Coach;
}

export interface AllocationResult {
  student: Student;
  proposals: Proposal[];
  /** Offered only when no existing class fits at all. */
  newClassSlots: NewClassSlot[];
  /** Why nothing (or not everything) fits, in plain words. */
  blockers: string[];
}

export function candidateClasses(d: Dataset, ix: Index, s: Student, date: ISODate): ClassTemplate[] {
  if (s.level === null) return [];
  const mine = new Set(classesOf(ix, s.id, date).map(c => c.id));
  const {enabled, maxGroupSize} = d.academy.mixLevels;
  const levelFits = (c: ClassTemplate) => {
    if (c.level === s.level) return true;
    // An adjacent-level group only opens up when it is too small to run alone.
    return enabled && Math.abs(c.level - s.level!) === 1 && enrolledOn(ix, c.id, date).length <= maxGroupSize;
  };
  return d.classes.filter(
    c =>
      c.sport === s.sport && c.group === s.group && levelFits(c) &&
      !mine.has(c.id) &&
      s.availability.weekdays.includes(c.weekday) &&
      c.startHour >= s.availability.fromHour && c.startHour + 1 <= s.availability.toHour &&
      enrolledOn(ix, c.id, date).length < c.capacity,
  );
}

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...rest] = arr;
  return [...combos(rest, k - 1).map(c => [head, ...c]), ...combos(rest, k)];
}

export function scoreCombo(d: Dataset, ix: Index, s: Student, combo: ClassTemplate[], date: ISODate): {score: number; reasons: string[]} {
  let score = 0;
  const reasons: string[] = [];
  const home = combo.filter(c => c.locationId === s.homeLocationId).length;
  score += home * 30;
  if (home === combo.length) reasons.push(`En su sede, ${ix.location.get(s.homeLocationId)!.short}`);
  else if (home === 0) reasons.push(`En ${ix.location.get(combo[0].locationId)!.short}, no es su sede`);

  const days = combo.map(c => c.weekday).sort();
  if (days.length > 1) {
    const gaps = days.slice(1).map((x, i) => x - days[i]);
    if (gaps.every(g => g >= 2)) {
      score += 14;
      reasons.push('Con día de descanso entre clases');
    } else {
      score -= 6;
      reasons.push('Días seguidos');
    }
    if (new Set(combo.map(c => c.startHour)).size === 1) {
      score += 10;
      reasons.push(`Misma hora los ${days.length} días`);
    }
    if (new Set(combo.map(c => c.locationId)).size > 1) score -= 20;
    if (new Set(combo.map(c => c.coachId)).size === 1) score += 4;
  }

  const siblings = (ix.familyMembers.get(s.familyId) ?? []).filter(m => m.id !== s.id);
  const together = new Set<string>();
  for (const sib of siblings) {
    for (const sc of classesOf(ix, sib.id, date)) {
      if (combo.some(c => c.weekday === sc.weekday && c.locationId === sc.locationId && Math.abs(c.startHour - sc.startHour) <= 1)) {
        together.add(sib.firstName);
      }
    }
  }
  if (together.size) {
    score += 16 * together.size;
    reasons.push(`Coincide con ${joinY([...together])} en la sede`);
  }

  const mixed = combo.filter(c => c.level !== s.level);
  if (mixed.length) {
    score -= 18 * mixed.length;
    reasons.push(`Grupo mixto con ${[...new Set(mixed.map(c => LEVEL_LABEL[c.level].toLowerCase()))].join(' y ')}`);
  }

  // Prefer filling groups that already run over leaving many half-empty ones.
  const fill = combo.reduce((sum, c) => sum + enrolledOn(ix, c.id, date).length / c.capacity, 0) / combo.length;
  score += Math.round(fill * 10);
  const lastSeat = combo.filter(c => enrolledOn(ix, c.id, date).length === c.capacity - 1).length;
  if (lastSeat) reasons.push(lastSeat === combo.length ? 'Completa los grupos' : 'Completa un grupo');
  return {score, reasons};
}

export function proposeFor(d: Dataset, ix: Index, s: Student, date: ISODate): AllocationResult {
  const blockers: string[] = [];
  if (s.level === null) {
    return {student: s, proposals: [], newClassSlots: [], blockers: ['Falta evaluar su nivel en la clase de prueba']};
  }
  const already = classesOf(ix, s.id, date);
  const takenDays = new Set(already.map(c => c.weekday));
  const want = Math.max(0, s.frequency - already.length);
  const cands = candidateClasses(d, ix, s, date).filter(c => !takenDays.has(c.weekday));

  let size = want;
  let found: ClassTemplate[][] = [];
  while (size > 0) {
    found = combos(cands, size).filter(c => new Set(c.map(x => x.weekday)).size === c.length);
    if (found.length) break;
    size--;
  }
  const proposals: Proposal[] = found
    .map(classes => {
      const sorted = [...classes].sort((a, b) => a.weekday - b.weekday);
      const {score, reasons} = scoreCombo(d, ix, s, sorted, date);
      return {id: sorted.map(c => c.id).join('+'), classes: sorted, score, reasons, partial: size < want};
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (size < want) {
    const same = d.classes.filter(c => c.sport === s.sport && c.group === s.group && c.level === s.level);
    const inWindow = same.filter(
      c => s.availability.weekdays.includes(c.weekday) && c.startHour >= s.availability.fromHour && c.startHour + 1 <= s.availability.toHour,
    );
    const days = joinY(s.availability.weekdays.map(w => WEEKDAY_LONG[w]));
    if (same.length === 0) blockers.push('Todavía no hay ningún grupo de su deporte y nivel');
    else if (inWindow.length === 0) blockers.push(`Ningún grupo de su nivel cae en su disponibilidad (${days}, ${hourLabel(s.availability.fromHour)}–${hourLabel(s.availability.toHour)})`);
    else if (inWindow.every(c => enrolledOn(ix, c.id, date).length >= c.capacity)) blockers.push('Los grupos que le encajan están completos');
    else blockers.push(`Solo encajan ${size} de las ${want} clases que pide`);
  }

  const newClassSlots = proposals.length === 0 ? freeSlotsFor(d, ix, s, date).slice(0, s.frequency) : [];
  return {student: s, proposals, newClassSlots, blockers};
}

/** Free court + coach pairs inside the student's availability, one per weekday. */
export function freeSlotsFor(d: Dataset, ix: Index, s: Student, _date: ISODate): NewClassSlot[] {
  const out: NewClassSlot[] = [];
  const busyCourt = new Set(d.classes.map(c => `${c.courtId}|${c.weekday}|${c.startHour}`));
  const busyCoach = new Set(d.classes.map(c => `${c.coachId}|${c.weekday}|${c.startHour}`));
  const {dayStartHour, dayEndHour} = d.academy;
  for (const weekday of s.availability.weekdays) {
    let slot: NewClassSlot | undefined;
    for (let h = Math.max(dayStartHour, s.availability.fromHour); h + 1 <= Math.min(dayEndHour, s.availability.toHour) && !slot; h++) {
      const court = d.courts.find(c => c.locationId === s.homeLocationId && c.sport === s.sport && !busyCourt.has(`${c.id}|${weekday}|${h}`));
      const coach = d.coaches
        .filter(c => c.sports.includes(s.sport) && !busyCoach.has(`${c.id}|${weekday}|${h}`))
        .sort((a, b) => Number(b.locationId === s.homeLocationId) - Number(a.locationId === s.homeLocationId))[0];
      if (court && coach) slot = {weekday, startHour: h, court, coach};
    }
    if (slot) out.push(slot);
  }
  return out;
}

export function describeClasses(ix: Index, classes: ClassTemplate[]): string {
  if (classes.length === 0) return 'Sin horario';
  const sorted = [...classes].sort((a, b) => a.weekday - b.weekday);
  const sameHour = new Set(sorted.map(c => c.startHour)).size === 1;
  const days = joinY(sorted.map(c => WEEKDAY_LONG[c.weekday]));
  if (sameHour) return `${days[0].toUpperCase()}${days.slice(1)} a las ${hourLabel(sorted[0].startHour)}`;
  const mixed = sorted.map(c => `${WEEKDAY_LONG[c.weekday]} ${hourLabel(c.startHour)}`).join(', ');
  return mixed[0].toUpperCase() + mixed.slice(1);
}
