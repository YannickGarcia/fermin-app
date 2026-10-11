'use client';
/** Calendar view state shared by the shell, the calendar and the command bar. */
import {useSyncExternalStore} from 'react';
import type {Group, ISODate, Level, Sport, Weekday} from '../domain/types';
import {addDays, mondayOf, toISO, weekdayOf} from '../dates';

export interface Filters {
  locationId: string | 'all';
  sport: Sport | null;
  group: Group | null;
  levels: Level[];
  coachId: string | null;
  onlyFree: boolean;
}
export interface UIState {
  today: ISODate;
  view: 'week' | 'day';
  weekMonday: ISODate;
  day: Weekday;
  filters: Filters;
  selectedClassId: string | null;
  focusStudentId: string | null;
  /** Student whose schedule proposals are being reviewed. */
  allocStudentId: string | null;
  /** Classes lit up on the grid (a hovered proposal, a command preview). */
  highlight: string[];
  commandOpen: boolean;
  /** Small screens only: the waiting list sheet is open. */
  queueOpen: boolean;
}

function initial(): UIState {
  const today = toISO(new Date());
  const wd = weekdayOf(today);
  // On a weekend the useful week is the one about to start.
  const weekMonday = wd > 5 ? addDays(mondayOf(today), 7) : mondayOf(today);
  return {
    today,
    view: 'week',
    weekMonday,
    day: wd > 5 ? 1 : wd,
    filters: {locationId: 'loc-turia', sport: null, group: null, levels: [], coachId: null, onlyFree: false},
    selectedClassId: null,
    focusStudentId: null,
    allocStudentId: null,
    highlight: [],
    commandOpen: false,
    queueOpen: false,
  };
}

let state: UIState | null = null;
const listeners = new Set<() => void>();
const get = () => (state ??= initial());
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export const getUI = get;
export function setUI(patch: Partial<UIState> | ((s: UIState) => Partial<UIState>)) {
  const cur = get();
  state = {...cur, ...(typeof patch === 'function' ? patch(cur) : patch)};
  listeners.forEach(l => l());
}
export function setFilters(patch: Partial<Filters>) {
  setUI(s => ({filters: {...s.filters, ...patch}}));
}
export function useUI(): UIState {
  return useSyncExternalStore(subscribe, get, get);
}

/** Puts one student in the spotlight and makes sure their classes are visible. */
export function focusStudent(studentId: string, locationIds: string[]) {
  setUI(s => ({
    focusStudentId: studentId,
    allocStudentId: null,
    selectedClassId: null,
    highlight: [],
    filters: {
      ...s.filters,
      sport: null, group: null, levels: [], coachId: null, onlyFree: false,
      locationId: locationIds.length === 1 ? locationIds[0] : locationIds.length === 0 ? s.filters.locationId : 'all',
    },
  }));
}
export function clearFocus() {
  setUI({focusStudentId: null, allocStudentId: null, highlight: []});
}
