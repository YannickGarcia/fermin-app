import type {Group, Level, Sport, Weekday} from './types';
import {MULTI_SPORT} from './sports';

export const SPORT_LABEL: Record<Sport, string> = {tennis: 'Tenis', padel: 'Pádel', pickleball: 'Pickleball'};
export const GROUP_LABEL: Record<Group, string> = {junior: 'Júnior', adult: 'Adultos'};
export const LEVEL_LABEL: Record<Level, string> = {1: 'Iniciación', 2: 'Intermedio', 3: 'Avanzado', 4: 'Competición'};
export const LEVEL_SHORT: Record<Level, string> = {1: 'Inic.', 2: 'Interm.', 3: 'Avanz.', 4: 'Comp.'};
/** Levels borrow the ball colours every tennis family already knows. */
export const LEVEL_BALL: Record<Level, string> = {1: 'roja', 2: 'naranja', 3: 'verde', 4: 'amarilla'};
export const LEVELS: Level[] = [1, 2, 3, 4];
/** "Pádel · " when several sports are on; empty while the academy runs one. */
export const sportPrefix = (s: Sport) => (MULTI_SPORT ? `${SPORT_LABEL[s]} · ` : '');

export const WEEKDAY_LONG: Record<Weekday, string> = {
  1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo',
};
export const WEEKDAY_SHORT: Record<Weekday, string> = {1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom'};

export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function joinY(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  const last = parts[parts.length - 1];
  const sep = /^(i|hi)/i.test(last) ? ' e ' : ' y ';
  return parts.slice(0, -1).join(', ') + sep + last;
}
