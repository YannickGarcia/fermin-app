/**
 * Rain forecast. Only rain matters to the academy: it decides whether an
 * outdoor class can be played, and a rained-off class earns a make-up.
 *
 * This is a deterministic mock so the demo always has a wet day to look at.
 * Production: Open-Meteo `hourly=precipitation_probability,precipitation`
 * per location (lat/lon), cached server-side, refreshed hourly. Forecasts
 * reach about two weeks ahead; beyond that the UI shows no forecast.
 */
import type {ISODate} from '../domain/types';
import {diffDays, mondayOf, weekdayOf} from '../dates';

export interface DayForecast {
  /** Probability of rain (0–100) for each class hour. */
  byHour: Record<number, number>;
  /** Highest probability during class hours. */
  peak: number;
  /** Expected millimetres during class hours. */
  mm: number;
}

export const FORECAST_DAYS = 14;
/** At or above this probability an outdoor class is flagged as at risk. */
export const RAIN_RISK = 60;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function forecastFor(locationId: string, date: ISODate, today: ISODate, hours: number[]): DayForecast | null {
  const ahead = diffDays(date, today);
  if (ahead < 0 || ahead >= FORECAST_DAYS) return null;
  const week = mondayOf(date);
  const wd = weekdayOf(date);
  // One front crosses each week: a wet day, with a damp day before or after.
  const wetDay = 1 + Math.floor(hash(`front|${week}`) * 5);
  const dampDay = wetDay + (hash(`damp|${week}`) < 0.5 ? -1 : 1);
  const local = hash(`${locationId}|${date}`);
  let base = 4 + local * 14;
  if (wd === wetDay) base = 62 + local * 28;
  else if (wd === dampDay) base = 28 + local * 26;
  // The front arrives during the afternoon and peaks at a different hour per location.
  const peakHour = hours[0] + Math.floor(hash(`peak|${locationId}|${date}`) * hours.length);
  const byHour: Record<number, number> = {};
  let peak = 0;
  let mm = 0;
  for (const h of hours) {
    const falloff = 1 - Math.min(0.55, Math.abs(h - peakHour) * 0.13);
    const p = Math.round(Math.max(0, Math.min(98, base * falloff + (hash(`${locationId}|${date}|${h}`) - 0.5) * 8)) / 5) * 5;
    byHour[h] = p;
    peak = Math.max(peak, p);
    mm += p >= 40 ? (p / 100) * 1.8 : 0;
  }
  return {byHour, peak, mm: Math.round(mm * 10) / 10};
}
