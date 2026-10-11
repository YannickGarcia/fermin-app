'use client';
import {CloudRain, Umbrella} from 'lucide-react';
import type {Session} from '@/lib/data/store';
import {MULTI_SPORT} from '@/lib/domain/sports';
import {GROUP_LABEL, LEVEL_LABEL, LEVEL_SHORT, SPORT_LABEL, hourLabel} from '@/lib/domain/labels';
import css from './calendar.module.css';

export interface ChipProps {
  session: Session;
  locationShort?: string;
  dense?: boolean;
  atRisk: boolean;
  isSelected: boolean;
  /** 'on' = part of the current spotlight, 'off' = pushed back, undefined = normal. */
  emphasis?: 'on' | 'off';
  onSelect: (classId: string) => void;
}

export function Seats({taken, capacity}: {taken: number; capacity: number}) {
  return (
    <span className={css.seats} aria-hidden>
      {Array.from({length: capacity}, (_, i) => (
        <span key={i} className={i < taken ? css.seatTaken : css.seatFree} />
      ))}
    </span>
  );
}

export function ClassChip({session: s, locationShort, dense, atRisk, isSelected, emphasis, onSelect}: ChipProps) {
  const c = s.cls;
  const taken = s.students.length + s.guests.length;
  const label = [
    `${MULTI_SPORT ? `${SPORT_LABEL[c.sport]} ${GROUP_LABEL[c.group].toLowerCase()}` : GROUP_LABEL[c.group]}, ${s.levels.map(l => LEVEL_LABEL[l]).join(' y ')}${s.levels.length > 1 ? ' (grupo mixto)' : ''}`,
    `${hourLabel(c.startHour)}, ${s.court.name}${locationShort ? ` (${locationShort})` : ''}`,
    `con ${s.coach.firstName}`,
    `${taken} de ${c.capacity} plazas`,
    s.cancelled ? 'cancelada por lluvia' : atRisk ? 'riesgo de lluvia' : '',
  ].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      className={css.chip}
      data-level={c.level}
      data-dense={dense || undefined}
      data-selected={isSelected || undefined}
      data-emphasis={emphasis}
      data-cancelled={s.cancelled ? '' : undefined}
      data-full={s.free === 0 || undefined}
      aria-label={label}
      aria-pressed={isSelected}
      title={label}
      onClick={() => onSelect(c.id)}>
      <span className={css.chipMain}>
        <span className={css.chipTitle}>
          {locationShort ? <span className={css.chipSede}>{locationShort.slice(0, 3)}</span> : null}
          <span className={css.chipCourt}>{s.court.short}</span>
          <span className={css.chipCoach}>{s.coach.firstName}{s.isSubstitute ? '*' : ''}</span>
        </span>
        {!dense && (
          <span className={css.chipMeta}>
            {s.levels.length > 1 ? s.levels.map(l => LEVEL_SHORT[l]).join(' + ') : LEVEL_LABEL[c.level]} · {c.group === 'junior' ? 'Júnior' : 'Adultos'}
          </span>
        )}
      </span>
      <span className={css.chipEnd}>
        {s.levels.filter(l => l !== c.level).map(l => <span key={l} data-level={l} className={css.mixDot} />)}
        {s.cancelled ? <Umbrella size={14} className={css.rainIcon} /> : atRisk ? <CloudRain size={14} className={css.rainIcon} /> : null}
        <Seats taken={taken} capacity={c.capacity} />
      </span>
    </button>
  );
}
