'use client';
import type {CSSProperties} from 'react';
import type {Dataset} from '@/lib/domain/types';
import type {Index, Session} from '@/lib/data/store';
import {WEEKDAY_SHORT, hourLabel} from '@/lib/domain/labels';
import {RAIN_RISK} from '@/lib/weather/forecast';
import {fromISO} from '@/lib/dates';
import type {WeekModel} from './model';
import {ClassChip} from './ClassChip';
import css from './calendar.module.css';

export interface GridProps {
  data: Dataset;
  ix: Index;
  model: WeekModel;
  sessions: Session[];
  today: string;
  showLocation: boolean;
  selectedClassId: string | null;
  emphasisOf: (s: Session) => 'on' | 'off' | undefined;
  onSelect: (classId: string) => void;
  onPickDay: (weekday: number) => void;
}

export function RainStrip({model, date, locationId}: {model: WeekModel; date: string; locationId?: string}) {
  const peak = locationId ? model.forecast[locationId]?.[date] ?? null : model.dayPeak(date);
  if (!peak) return <span className={css.noForecast}>Sin previsión todavía</span>;
  const wet = peak.peak >= RAIN_RISK;
  return (
    <span className={css.rain} data-wet={wet || undefined}>
      <span className={css.rainBars} aria-hidden>
        {model.hours.map(h => {
          const p = model.rainAt(date, h, locationId) ?? 0;
          return <span key={h} className={css.rainBar} style={{'--p': p} as CSSProperties} data-wet={p >= RAIN_RISK || undefined} />;
        })}
      </span>
      <span className={css.rainLabel}>
        <strong>{peak.peak}%</strong><span className={css.rainWord}> lluvia{wet && peak.mm > 0 ? ` · ${peak.mm} mm` : ''}</span>
      </span>
    </span>
  );
}

export function WeekGrid({ix, model, sessions, today, showLocation, selectedClassId, emphasisOf, onSelect, onPickDay}: GridProps) {
  const cell = (date: string, hour: number) =>
    sessions
      .filter(s => s.date === date && s.cls.startHour === hour)
      .sort((a, b) => a.cls.locationId.localeCompare(b.cls.locationId) || a.court.short.localeCompare(b.court.short));
  return (
    <div className={css.week} style={{'--cols': model.days.length} as CSSProperties} role="grid" aria-label="Calendario semanal">
      <div className={css.corner} />
      {model.days.map(d => (
        <button key={d.date} type="button" className={css.dayHead} data-today={d.date === today || undefined} onClick={() => onPickDay(d.weekday)}>
          <span className={css.dayName}>
            <span>{WEEKDAY_SHORT[d.weekday]}</span>
            <span className={css.dayNum}>{fromISO(d.date).getDate()}</span>
          </span>
          <RainStrip model={model} date={d.date} />
        </button>
      ))}
      {model.hours.map(h => (
        <div key={h} className={css.row} role="row">
          <div className={css.hour}>{hourLabel(h)}</div>
          {model.days.map(d => {
            const p = model.rainAt(d.date, h);
            const list = cell(d.date, h);
            return (
              <div key={d.date} className={css.cell} role="gridcell" data-today={d.date === today || undefined}
                style={{'--rain': p ?? 0} as CSSProperties} data-dense={showLocation || list.length > 4 || undefined}>
                {list.map(s => (
                  <ClassChip
                    key={s.cls.id}
                    session={s}
                    dense={showLocation || list.length > 4}
                    locationShort={showLocation ? ix.location.get(s.cls.locationId)!.short : undefined}
                    atRisk={model.atRisk(s)}
                    isSelected={selectedClassId === s.cls.id}
                    emphasis={emphasisOf(s)}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
