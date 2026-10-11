'use client';
import type {CSSProperties} from 'react';
import {CloudRain, Umbrella} from 'lucide-react';
import type {Court} from '@/lib/domain/types';
import type {Session} from '@/lib/data/store';
import {GROUP_LABEL, LEVEL_LABEL, WEEKDAY_SHORT, hourLabel} from '@/lib/domain/labels';
import {fromISO} from '@/lib/dates';
import type {GridProps} from './WeekGrid';
import {RainStrip} from './WeekGrid';
import {Seats} from './ClassChip';
import css from './calendar.module.css';

interface DayProps extends GridProps {
  date: string;
  courts: Court[];
  focusStudentId: string | null;
  isMobile: boolean;
}

function SessionCard({s, atRisk, isSelected, emphasis, focusStudentId, onSelect, where}: {
  s: Session; atRisk: boolean; isSelected: boolean; emphasis?: 'on' | 'off'; focusStudentId: string | null;
  onSelect: (id: string) => void; where?: string;
}) {
  const c = s.cls;
  const taken = s.students.length + s.guests.length;
  return (
    <button type="button" className={css.card} data-level={c.level} data-selected={isSelected || undefined} data-emphasis={emphasis}
      data-cancelled={s.cancelled ? '' : undefined} aria-pressed={isSelected} onClick={() => onSelect(c.id)}>
      <span className={css.cardHead}>
        <span className={css.cardTitle}>{s.levels.map(l => LEVEL_LABEL[l]).join(' + ')}</span>
        <Seats taken={taken} capacity={c.capacity} />
      </span>
      <span className={css.cardMeta}>
        {where ? `${where} · ` : ''}{GROUP_LABEL[c.group]} · {s.coach.firstName}{s.isSubstitute ? ' (sustituye)' : ''}
      </span>
      {s.cancelled ? (
        <span className={css.cardFlag}><Umbrella size={14} /> Cancelada por lluvia</span>
      ) : atRisk ? (
        <span className={css.cardFlag}><CloudRain size={14} /> Riesgo de lluvia</span>
      ) : null}
      <span className={css.roster}>
        {s.students.map(st => (
          <span key={st.id} className={css.rosterName} data-me={st.id === focusStudentId || undefined} data-absent={s.absentIds.has(st.id) || undefined}>
            {st.firstName} {st.lastName[0]}.
          </span>
        ))}
        {s.guests.map(st => (
          <span key={st.id} className={css.rosterName} data-guest>{st.firstName} {st.lastName[0]}. (recupera)</span>
        ))}
        {Array.from({length: s.free}, (_, i) => <span key={i} className={css.rosterFree}>Plaza libre</span>)}
      </span>
    </button>
  );
}

export function DayGrid(p: DayProps) {
  const {ix, model, sessions, date, courts, isMobile} = p;
  const today = sessions.filter(s => s.date === date);
  const weekday = model.days.find(d => d.date === date)?.weekday ?? 1;

  if (isMobile) {
    const byHour = model.hours.map(h => ({h, list: today.filter(s => s.cls.startHour === h)})).filter(x => x.list.length);
    return (
      <div className={css.agenda}>
        {byHour.length === 0 && <p className={css.agendaEmpty}>No hay clases con estos filtros el {WEEKDAY_SHORT[weekday].toLowerCase()} {fromISO(date).getDate()}.</p>}
        {byHour.map(({h, list}) => {
          const rain = model.rainAt(date, h);
          return (
            <section key={h} className={css.agendaHour}>
              <header className={css.agendaHead}>
                <span className={css.agendaTime}>{hourLabel(h)}</span>
                {rain !== null && rain >= 30 && <span className={css.agendaRain}><CloudRain size={14} /> {rain}%</span>}
              </header>
              {list.map(s => (
                <SessionCard key={s.cls.id} s={s} atRisk={model.atRisk(s)} isSelected={p.selectedClassId === s.cls.id} emphasis={p.emphasisOf(s)}
                  focusStudentId={p.focusStudentId} onSelect={p.onSelect}
                  where={`${s.court.name}${p.showLocation ? `, ${ix.location.get(s.cls.locationId)!.short}` : ''}`} />
              ))}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className={css.day} style={{'--cols': courts.length} as CSSProperties} role="grid" aria-label="Calendario del día por pista">
      <div className={css.corner} />
      {courts.map(c => (
        <div key={c.id} className={css.courtHead}>
          <span className={css.courtName}>{c.name}{p.showLocation ? <span className={css.courtSede}> {ix.location.get(c.locationId)!.short}</span> : null}</span>
          <span className={css.courtKind} data-covered={c.covered || undefined}>{c.covered ? 'Cubierta' : 'Aire libre'}</span>
        </div>
      ))}
      {model.hours.map(h => (
        <div key={h} className={css.row} role="row">
          <div className={css.hour}>{hourLabel(h)}</div>
          {courts.map(c => {
            const s = today.find(x => x.court.id === c.id && x.cls.startHour === h);
            const rain = c.covered ? 0 : model.rainAt(date, h, c.locationId) ?? 0;
            return (
              <div key={c.id} className={css.cell} role="gridcell" style={{'--rain': rain} as CSSProperties}>
                {s && <SessionCard s={s} atRisk={model.atRisk(s)} isSelected={p.selectedClassId === s.cls.id} emphasis={p.emphasisOf(s)}
                  focusStudentId={p.focusStudentId} onSelect={p.onSelect} />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function DayStrip({model, day, onPick, today}: {model: GridProps['model']; day: number; onPick: (w: number) => void; today: string}) {
  return (
    <div className={css.dayStrip} role="tablist" aria-label="Día de la semana">
      {model.days.map(d => (
        <button key={d.date} type="button" role="tab" aria-selected={d.weekday === day} className={css.dayTab}
          data-today={d.date === today || undefined} onClick={() => onPick(d.weekday)}>
          <span className={css.dayName}><span>{WEEKDAY_SHORT[d.weekday]}</span><span className={css.dayNum}>{fromISO(d.date).getDate()}</span></span>
          <RainStrip model={model} date={d.date} />
        </button>
      ))}
    </div>
  );
}
