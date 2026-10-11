'use client';
import {useMemo} from 'react';
import type {Dataset, ISODate, Weekday} from '@/lib/domain/types';
import {type Index, type Session, sessionOf} from '@/lib/data/store';
import {type DayForecast, RAIN_RISK, forecastFor} from '@/lib/weather/forecast';
import type {Filters} from '@/lib/ui/state';
import {addDays} from '@/lib/dates';

export interface WeekModel {
  days: Array<{date: ISODate; weekday: Weekday}>;
  hours: number[];
  /** Every session of the week, before filters. */
  sessions: Session[];
  /** forecast[locationId][date] */
  forecast: Record<string, Record<ISODate, DayForecast | null>>;
  /** Peak rain probability for the visible locations at a day and hour, or null when there is no forecast. */
  rainAt: (date: ISODate, hour: number, locationId?: string) => number | null;
  dayPeak: (date: ISODate) => {peak: number; mm: number} | null;
  atRisk: (s: Session) => boolean;
}

export function useWeekModel(d: Dataset, ix: Index, weekMonday: ISODate, today: ISODate, locationFilter: string | 'all'): WeekModel {
  return useMemo(() => {
    const days = d.academy.openWeekdays.map(weekday => ({date: addDays(weekMonday, weekday - 1), weekday}));
    const hours: number[] = [];
    for (let h = d.academy.dayStartHour; h < d.academy.dayEndHour; h++) hours.push(h);
    const sessions = d.classes.map(c => sessionOf(d, ix, c, addDays(weekMonday, c.weekday - 1)));
    const forecast: WeekModel['forecast'] = {};
    for (const l of d.locations) {
      forecast[l.id] = {};
      for (const day of days) forecast[l.id][day.date] = forecastFor(l.id, day.date, today, hours);
    }
    const visible = locationFilter === 'all' ? d.locations.map(l => l.id) : [locationFilter];
    const rainAt = (date: ISODate, hour: number, locationId?: string) => {
      const ids = locationId ? [locationId] : visible;
      const vals = ids.map(id => forecast[id]?.[date]?.byHour[hour]).filter((v): v is number => v !== undefined);
      return vals.length ? Math.max(...vals) : null;
    };
    const dayPeak = (date: ISODate) => {
      const fs = visible.map(id => forecast[id][date]).filter((f): f is DayForecast => !!f);
      if (!fs.length) return null;
      return {peak: Math.max(...fs.map(f => f.peak)), mm: Math.max(...fs.map(f => f.mm))};
    };
    const atRisk = (s: Session) => {
      if (s.court.covered || s.cancelled) return false;
      const p = forecast[s.cls.locationId]?.[s.date]?.byHour[s.cls.startHour];
      return p !== undefined && p >= RAIN_RISK;
    };
    return {days, hours, sessions, forecast, rainAt, dayPeak, atRisk};
  }, [d, ix, weekMonday, today, locationFilter]);
}

export function matches(s: Session, f: Filters): boolean {
  const c = s.cls;
  if (f.locationId !== 'all' && c.locationId !== f.locationId) return false;
  if (f.sport && c.sport !== f.sport) return false;
  if (f.group && c.group !== f.group) return false;
  if (f.levels.length && !f.levels.includes(c.level)) return false;
  if (f.coachId && s.coach.id !== f.coachId) return false;
  if (f.onlyFree && (s.free === 0 || s.cancelled)) return false;
  return true;
}
