import type {Group, Sport} from './types';

/**
 * Sports the data model supports. Padel and pickleball are fully modelled
 * (types, schema, programme, labels, capacity) but switched off for the MVP.
 */
export const ALL_SPORTS: Sport[] = ['tennis', 'padel', 'pickleball'];

/**
 * Sports the product offers today. To switch one on, add it here and give it
 * courts and coaches in lib/data/seed.ts.
 */
export const SPORTS: Sport[] = ['tennis'];

/** With one sport there is nothing to filter or tell apart, so the UI hides it. */
export const MULTI_SPORT = SPORTS.length > 1;

export const isEnabledSport = (s: Sport) => SPORTS.includes(s);

/** Default seats for a new class (D6). Stored per class and editable. */
export function defaultCapacity(sport: Sport, group: Group): number {
  if (sport === 'padel') return 4;
  if (sport === 'pickleball' || group === 'junior') return 6;
  return 4;
}
