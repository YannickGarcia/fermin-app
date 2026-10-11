'use client';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import type {Dataset, Group, Level, Sport} from '@/lib/domain/types';
import {GROUP_LABEL, LEVELS, LEVEL_LABEL, SPORT_LABEL} from '@/lib/domain/labels';
import {MULTI_SPORT, SPORTS} from '@/lib/domain/sports';
import {programFor, seasonWeekNumber} from '@/lib/domain/program';
import {addDays, mondayOf, weekRangeLabel} from '@/lib/dates';
import {type UIState, setFilters, setUI} from '@/lib/ui/state';
import css from './calendar.module.css';

export function Toolbar({data, ui, isMobile, stats}: {data: Dataset; ui: UIState; isMobile: boolean; stats: {classes: number; seats: number; taken: number}}) {
  const f = ui.filters;
  const week = seasonWeekNumber(data.academy.season.start, ui.weekMonday);
  const inSeason = ui.weekMonday >= mondayOf(data.academy.season.start) && ui.weekMonday <= data.academy.season.end;
  const thisWeek = (() => {
    const m = mondayOf(ui.today);
    return ui.today > addDays(m, 4) ? addDays(m, 7) : m;
  })();
  const toggleLevel = (l: Level) => setFilters({levels: f.levels.includes(l) ? f.levels.filter(x => x !== l) : [...f.levels, l]});
  const sportsShown: Sport[] = f.sport ? [f.sport] : SPORTS;

  return (
    <div className={css.toolbar}>
      <div className={css.titleRow}>
        <div className={css.weekNav}>
          <IconButton label="Semana anterior" icon={<ChevronLeft size={18} />} variant="ghost" onClick={() => setUI({weekMonday: addDays(ui.weekMonday, -7), selectedClassId: null})} />
          <IconButton label="Semana siguiente" icon={<ChevronRight size={18} />} variant="ghost" onClick={() => setUI({weekMonday: addDays(ui.weekMonday, 7), selectedClassId: null})} />
          <div className={css.weekTitle}>
            <h1>{weekRangeLabel(ui.weekMonday, data.academy.openWeekdays.length)}</h1>
            <p>
              {inSeason ? `Semana ${week} de la temporada` : 'Fuera de temporada'}
              {!isMobile && ` · ${stats.classes} clases · ${stats.taken} de ${stats.seats} plazas ocupadas`}
            </p>
          </div>
          {ui.weekMonday !== thisWeek && <Button label="Esta semana" variant="secondary" size="sm" onClick={() => setUI({weekMonday: thisWeek})} />}
        </div>
        {!isMobile && (
          <SegmentedControl label="Vista" value={ui.view} onChange={v => setUI({view: v as UIState['view']})}>
            <SegmentedControlItem value="week" label="Semana" />
            <SegmentedControlItem value="day" label="Día por pista" />
          </SegmentedControl>
        )}
      </div>

      <div className={css.filterRow}>
        <SegmentedControl label="Sede" value={f.locationId} onChange={v => setFilters({locationId: v})} size="sm">
          <SegmentedControlItem value="all" label="Todas" />
          {data.locations.map(l => <SegmentedControlItem key={l.id} value={l.id} label={l.short} />)}
        </SegmentedControl>
        <div className={css.levels} role="group" aria-label="Filtrar por nivel">
          {LEVELS.map(l => (
            <button key={l} type="button" className={css.levelToggle} data-level={l} aria-pressed={f.levels.includes(l)} onClick={() => toggleLevel(l)}>
              <span className={css.ball} />{LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
        {MULTI_SPORT && (
          <Selector label="Deporte" isLabelHidden placeholder="Deporte" size="sm" variant="ghost" hasClear value={f.sport}
            options={SPORTS.map(s => ({value: s, label: SPORT_LABEL[s]}))} onChange={v => setFilters({sport: (v as Sport) || null})} />
        )}
        <Selector label="Grupo" isLabelHidden placeholder="Edad" size="sm" variant="ghost" hasClear value={f.group}
          options={(['junior', 'adult'] as Group[]).map(g => ({value: g, label: GROUP_LABEL[g]}))} onChange={v => setFilters({group: (v as Group) || null})} />
        <Selector label="Entrenador" isLabelHidden placeholder="Entrenador" size="sm" variant="ghost" hasClear hasSearch searchPlaceholder="Buscar entrenador" value={f.coachId}
          options={data.coaches.map(c => ({value: c.id, label: `${c.firstName} ${c.lastName}`, description: c.isLead ? 'Referente' : undefined}))}
          onChange={v => setFilters({coachId: v || null})} />
        <button type="button" className={css.levelToggle} aria-pressed={f.onlyFree} onClick={() => setFilters({onlyFree: !f.onlyFree})}>
          <span className={css.freeDot} />Con plazas
        </button>
      </div>

      {!isMobile && inSeason && (
        <p className={css.program}>
          <span className={css.programLead}>Programa de la semana</span>
          {sportsShown.map(s => (
            <span key={s} className={css.programItem}>{MULTI_SPORT && <strong>{SPORT_LABEL[s]}</strong>} {programFor(s, 1, week).title}</span>
          ))}
        </p>
      )}
    </div>
  );
}
