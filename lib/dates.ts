import type {ISODate, Weekday} from './domain/types';

export function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function weekdayOf(s: ISODate): Weekday {
  const g = fromISO(s).getDay();
  return (g === 0 ? 7 : g) as Weekday;
}
/** Monday of the week containing the date. */
export function mondayOf(s: ISODate): ISODate {
  return addDays(s, 1 - weekdayOf(s));
}
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
}
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function dayMonth(s: ISODate): string {
  const d = fromISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function weekRangeLabel(monday: ISODate, days: number): string {
  const a = fromISO(monday);
  const b = fromISO(addDays(monday, days - 1));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}
export function ageOn(birth: ISODate, on: ISODate): number {
  const b = fromISO(birth);
  const o = fromISO(on);
  let a = o.getFullYear() - b.getFullYear();
  if (o.getMonth() < b.getMonth() || (o.getMonth() === b.getMonth() && o.getDate() < b.getDate())) a--;
  return a;
}
