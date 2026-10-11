'use client';
import {useCallback, useEffect, useMemo, useRef} from 'react';
import {MotionConfig, motion} from 'motion/react';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {X} from 'lucide-react';
import {type Session, classesOf, useData, useIndex} from '@/lib/data/store';
import {describeClasses} from '@/lib/scheduling/allocate';
import {addDays} from '@/lib/dates';
import {clearFocus, setUI, useUI} from '@/lib/ui/state';
import {matches, useWeekModel} from './model';
import {Toolbar} from './Toolbar';
import {WeekGrid} from './WeekGrid';
import {DayGrid, DayStrip} from './DayGrid';
import {Inspector, inspectorKey} from './Inspector';
import css from './calendar.module.css';

export default function CalendarScreen() {
  const data = useData();
  const ix = useIndex(data);
  const ui = useUI();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const isWide = useMediaQuery('(min-width: 1180px)');
  const model = useWeekModel(data, ix, ui.weekMonday, ui.today, ui.filters.locationId);

  const visible = useMemo(() => model.sessions.filter(s => matches(s, ui.filters)), [model, ui.filters]);
  const stats = useMemo(() => ({
    classes: visible.length,
    seats: visible.reduce((n, s) => n + s.cls.capacity, 0),
    taken: visible.reduce((n, s) => n + s.students.length + s.guests.length, 0),
  }), [visible]);

  const focus = ui.focusStudentId ? ix.student.get(ui.focusStudentId) : undefined;
  const focusClasses = useMemo(() => (focus ? classesOf(ix, focus.id, ui.weekMonday) : []), [focus, ix, ui.weekMonday]);
  const spotlight = useMemo(() => {
    const ids = new Set<string>(ui.highlight);
    focusClasses.forEach(c => ids.add(c.id));
    return ids;
  }, [ui.highlight, focusClasses]);
  const emphasisOf = useCallback(
    (s: Session) => (spotlight.size === 0 ? undefined : spotlight.has(s.cls.id) ? 'on' : 'off'),
    [spotlight],
  );
  // Bring whatever is in the spotlight into view; the evening rows start below the fold.
  const scroller = useRef<HTMLDivElement>(null);
  const spotKey = [...spotlight].join(',');
  useEffect(() => {
    if (!spotKey) return;
    const t = setTimeout(() => {
      scroller.current?.querySelector('[data-emphasis="on"]')?.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
    }, 220);
    return () => clearTimeout(t);
  }, [spotKey, ui.view, ui.day, ui.weekMonday, ui.filters.locationId]);

  const onSelect = useCallback((classId: string) => setUI(s => ({selectedClassId: s.selectedClassId === classId ? null : classId, allocStudentId: null})), []);
  const onPickDay = useCallback((weekday: number) => setUI({day: weekday as 1, view: 'day'}), []);

  const view = isMobile ? 'day' : ui.view;
  const date = addDays(ui.weekMonday, ui.day - 1);
  const courts = data.courts.filter(c =>
    (ui.filters.locationId === 'all' || c.locationId === ui.filters.locationId) && (!ui.filters.sport || c.sport === ui.filters.sport));
  const grid = {
    data, ix, model, sessions: visible, today: ui.today, showLocation: ui.filters.locationId === 'all',
    selectedClassId: ui.selectedClassId, emphasisOf, onSelect, onPickDay,
  };
  const panelOpen = inspectorKey(ui) !== 'queue';

  return (
    <MotionConfig reducedMotion="user">
      <div className={css.screen}>
        <div className={css.main}>
          <Toolbar data={data} ui={ui} isMobile={isMobile} stats={stats} />
          {focus && (
            <div className={css.focusBar} role="status">
              <span><strong>{focus.firstName} {focus.lastName}</strong> · {focusClasses.length ? describeClasses(ix, focusClasses) : 'sin horario esta semana'}</span>
              <Button label="Quitar" icon={<X size={14} />} size="sm" variant="ghost" onClick={clearFocus} />
            </div>
          )}
          {view === 'day' && <DayStrip model={model} day={ui.day} today={ui.today} onPick={w => setUI({day: w as 1})} />}
          <div className={css.scroller} ref={scroller}>
            <motion.div key={`${view}-${ui.weekMonday}-${view === 'day' ? ui.day : ''}`} initial={{opacity: 0, y: 4}} animate={{opacity: 1, y: 0}} transition={{duration: 0.18, ease: 'easeOut'}}>
              {view === 'week' ? (
                <WeekGrid {...grid} />
              ) : (
                <DayGrid {...grid} date={date} courts={courts} focusStudentId={ui.focusStudentId} isMobile={isMobile} />
              )}
            </motion.div>
          </div>
        </div>
        {isWide ? (
          <aside className={css.aside} aria-label="Detalle">
            <Inspector data={data} ix={ix} model={model} ui={ui} />
          </aside>
        ) : (
          <>
            {!panelOpen && (
              <div className={css.fab}>
                <Button label={`Sin asignar (${data.students.filter(s => s.status === 'pending').length})`} variant="primary" onClick={() => setUI({queueOpen: true})} />
              </div>
            )}
            <BottomSheet label="Detalle" isOpen={panelOpen || ui.queueOpen} purpose="info" padding={0}
              onOpenChange={open => { if (!open) setUI({selectedClassId: null, allocStudentId: null, focusStudentId: null, highlight: [], queueOpen: false}); }}>
              <Inspector data={data} ix={ix} model={model} ui={ui} />
            </BottomSheet>
          </>
        )}
      </div>
    </MotionConfig>
  );
}
