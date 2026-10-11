'use client';
import {useEffect, useMemo, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {ArrowLeft, CloudRain, Sparkles, Umbrella, X} from 'lucide-react';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {Selector} from '@astryxdesign/core/Selector';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import type {ClassTemplate, Dataset, MakeupCredit, Student} from '@/lib/domain/types';
import {
  type Index, type Session, bookCredit, buildIndex, cancelForRain, classesOf, clearAbsence, createClass, creditExpiry, enrollStudent, isExpired,
  getData, markAbsence, restoreSession, sessionOf, setCoach, transaction,
} from '@/lib/data/store';
import {GROUP_LABEL, LEVEL_BALL, LEVEL_LABEL, WEEKDAY_LONG, WEEKDAY_SHORT, hourLabel, joinY, sportPrefix} from '@/lib/domain/labels';
import {defaultCapacity} from '@/lib/domain/sports';
import {describeClasses, proposeFor} from '@/lib/scheduling/allocate';
import {programFor, seasonWeekNumber} from '@/lib/domain/program';
import {addDays, ageOn, dayMonth, mondayOf} from '@/lib/dates';
import {type UIState, clearFocus, focusStudent, setUI} from '@/lib/ui/state';
import type {WeekModel} from './model';
import {useNotify} from './useNotify';
import css from './inspector.module.css';

interface PanelProps {
  data: Dataset;
  ix: Index;
  model: WeekModel;
  ui: UIState;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const fullName = (s: Student) => `${s.firstName} ${s.lastName}`;
const effectiveFrom = (ui: UIState) => (ui.weekMonday > mondayOf(ui.today) ? ui.weekMonday : mondayOf(ui.today));

function availabilityLine(s: Student) {
  return `${s.availability.weekdays.map(w => WEEKDAY_SHORT[w]).join(' ')} · ${hourLabel(s.availability.fromHour)}–${hourLabel(s.availability.toHour)} · ${s.frequency} ${s.frequency === 1 ? 'clase' : 'clases'} por semana`;
}

function LevelTag({s}: {s: Pick<Student, 'level' | 'sport' | 'group'>}) {
  return (
    <span className={css.levelTag} data-level={s.level ?? undefined}>
      <span className={css.ball} />
      {sportPrefix(s.sport)}{GROUP_LABEL[s.group]} · {s.level ? LEVEL_LABEL[s.level] : 'Nivel por evaluar'}
    </span>
  );
}

function PanelHeader({title, subtitle, onBack, onClose}: {title: string; subtitle?: React.ReactNode; onBack?: () => void; onClose?: () => void}) {
  return (
    <header className={css.head}>
      {onBack && <IconButton label="Volver" icon={<ArrowLeft size={16} />} variant="ghost" size="sm" onClick={onBack} />}
      <div className={css.headText}>
        <Heading level={3}>{title}</Heading>
        {subtitle && <div className={css.headSub}>{subtitle}</div>}
      </div>
      {onClose && <IconButton label="Cerrar" icon={<X size={16} />} variant="ghost" size="sm" onClick={onClose} />}
    </header>
  );
}

// ── Waiting list ───────────────────────────────────────────────────────────
function QueuePanel({data, ix, ui}: PanelProps) {
  const notify = useNotify();
  const pending = data.students.filter(s => s.status === 'pending');
  const trials = data.students.filter(s => s.status === 'trial').sort((a, b) => a.trialDate.localeCompare(b.trialDate));
  const credits = data.credits.filter(c => c.status === 'open' && !isExpired(data, c, ui.today));

  const assignAll = () => {
    let placed = 0;
    const from = effectiveFrom(ui);
    transaction(() => {
      for (const s of pending) {
        const d = getData();
        const r = proposeFor(d, buildIndex(d), s, ui.weekMonday);
        const best = r.proposals.find(p => !p.partial);
        if (!best) continue;
        enrollStudent(s.id, best.classes.map(c => c.id), from);
        placed++;
      }
    });
    const left = pending.length - placed;
    notify(`${placed} ${placed === 1 ? 'alumno asignado' : 'alumnos asignados'}${left ? `. ${left} sin hueco: revísalos uno a uno` : ''}`, {canUndo: placed > 0});
  };

  return (
    <div className={css.panel}>
      <PanelHeader title="Sin asignar" subtitle={`${pending.length} con nivel evaluado, esperando horario`} />
      {pending.length > 0 ? (
        <>
          <div className={css.block}>
            <Button label={`Asignar los ${pending.length} automáticamente`} icon={<Sparkles size={16} />} variant="secondary" width="100%" onClick={assignAll} />
          </div>
          <ul className={css.list}>
            {pending.map(s => (
              <li key={s.id}>
                <button type="button" className={css.rowButton} onClick={() => setUI({allocStudentId: s.id, selectedClassId: null, focusStudentId: null})}>
                  <span className={css.rowMain}>
                    <span className={css.rowTitle}>{fullName(s)}</span>
                    <LevelTag s={s} />
                    <span className={css.rowSub}>{availabilityLine(s)}</span>
                  </span>
                  <span className={css.rowAction}>Proponer</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={css.empty}>Todos los alumnos evaluados tienen horario.</p>
      )}

      <h4 className={css.sectionTitle}>Recuperaciones pendientes <span className={css.count}>{credits.length}</span></h4>
      {credits.length === 0 && <p className={css.empty}>No hay clases por recuperar.</p>}
      <ul className={css.list}>
        {credits.map(c => {
          const s = ix.student.get(c.studentId)!;
          return (
            <li key={c.id}>
              <button type="button" className={css.rowButton} onClick={() => focusStudent(s.id, [...new Set(classesOf(ix, s.id, ui.weekMonday).map(k => k.locationId))])}>
                <span className={css.rowMain}>
                  <span className={css.rowTitle}>{fullName(s)}</span>
                  <span className={css.rowSub}>
                    {c.reason === 'weather' ? 'Lluvia' : 'Certificado médico'} · clase del {dayMonth(c.originDate)}{creditExpiry(data, c) ? ` · caduca el ${dayMonth(creditExpiry(data, c)!)}` : ''}
                  </span>
                </span>
                <span className={css.rowAction}>Ver</span>
              </button>
            </li>
          );
        })}
      </ul>

      <h4 className={css.sectionTitle}>Clases de prueba <span className={css.count}>{trials.length}</span></h4>
      <ul className={css.list}>
        {trials.map(s => (
          <li key={s.id} className={css.rowStatic}>
            <span className={css.rowMain}>
              <span className={css.rowTitle}>{fullName(s)}</span>
              <span className={css.rowSub}>{sportPrefix(s.sport)}{GROUP_LABEL[s.group]} · prueba el {dayMonth(s.trialDate)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Schedule proposals for one student ─────────────────────────────────────
function AllocationPanel({data, ix, ui}: PanelProps) {
  const notify = useNotify();
  const student = ix.student.get(ui.allocStudentId!)!;
  const result = useMemo(() => proposeFor(data, ix, student, ui.weekMonday), [data, ix, student, ui.weekMonday]);
  const [picked, setPicked] = useState(result.proposals[0]?.id ?? null);
  const current = result.proposals.find(p => p.id === picked) ?? result.proposals[0];

  useEffect(() => {
    const ids = current?.classes.map(c => c.id) ?? [];
    const locs = [...new Set(current?.classes.map(c => c.locationId) ?? [])];
    setUI(s => ({highlight: ids, filters: locs.length === 1 ? {...s.filters, locationId: locs[0], sport: null, group: null, levels: [], coachId: null, onlyFree: false} : s.filters}));
    return () => setUI({highlight: []});
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const assign = () => {
    if (!current) return;
    enrollStudent(student.id, current.classes.map(c => c.id), effectiveFrom(ui));
    notify(`${student.firstName} empieza: ${describeClasses(ix, current.classes).toLowerCase()}`, {canUndo: true});
    focusStudent(student.id, [...new Set(current.classes.map(c => c.locationId))]);
  };
  const openNew = () => {
    transaction(() => {
      const ids = result.newClassSlots.map(slot =>
        createClass({
          locationId: slot.court.locationId, courtId: slot.court.id, coachId: slot.coach.id, sport: student.sport, group: student.group,
          level: student.level!, weekday: slot.weekday, startHour: slot.startHour, capacity: defaultCapacity(student.sport, student.group),
        }),
      );
      enrollStudent(student.id, ids, effectiveFrom(ui));
    });
    notify(`Grupo nuevo abierto para ${student.firstName}`, {canUndo: true});
    focusStudent(student.id, [student.homeLocationId]);
  };

  return (
    <div className={css.panel}>
      <PanelHeader title={fullName(student)} subtitle={<LevelTag s={student} />} onBack={() => setUI({allocStudentId: null, highlight: []})} />
      <div className={css.block}>
        <Text type="supporting" color="secondary">Puede venir</Text>
        <Text>{availabilityLine(student)}</Text>
        <Text type="supporting" color="secondary">Sede {ix.location.get(student.homeLocationId)!.short} · prueba el {dayMonth(student.trialDate)}</Text>
      </div>

      {result.blockers.map(b => (
        <div className={css.block} key={b}><Banner status="warning" title={b} /></div>
      ))}

      {result.proposals.length > 0 && (
        <>
          <h4 className={css.sectionTitle}>{result.proposals.length === 1 ? 'Horario propuesto' : 'Horarios propuestos'}</h4>
          <div className={css.proposals} role="radiogroup" aria-label="Horarios propuestos">
            {result.proposals.map((p, i) => (
              <motion.button
                key={p.id} type="button" role="radio" aria-checked={p.id === current?.id}
                className={css.proposal} data-picked={p.id === current?.id || undefined}
                initial={{opacity: 0, y: 6}} animate={{opacity: 1, y: 0}} transition={{delay: i * 0.05, duration: 0.2}}
                onClick={() => setPicked(p.id)}>
                <span className={css.proposalTitle}>{describeClasses(ix, p.classes)}{i === 0 ? <span className={css.best}>Mejor encaje</span> : null}</span>
                {p.classes.map(c => (
                  <span key={c.id} className={css.proposalLine}>
                    {cap(WEEKDAY_LONG[c.weekday])} {hourLabel(c.startHour)} · {ix.court.get(c.courtId)!.name}, {ix.location.get(c.locationId)!.short} · {ix.coach.get(c.coachId)!.firstName} · {(ix.enrollmentsByClass.get(c.id) ?? []).filter(e => e.to === null).length}/{c.capacity}
                  </span>
                ))}
                <span className={css.reasons}>{p.reasons.join(' · ')}</span>
              </motion.button>
            ))}
          </div>
          <div className={css.block}>
            <Button label={current?.partial ? 'Asignar lo que encaja' : 'Asignar este horario'} variant="primary" width="100%" onClick={assign} />
          </div>
        </>
      )}

      {result.proposals.length === 0 && result.newClassSlots.length > 0 && (
        <>
          <h4 className={css.sectionTitle}>Abrir un grupo nuevo</h4>
          <div className={css.block}>
            <Text color="secondary">Hay pista y entrenador libres dentro de su disponibilidad:</Text>
            {result.newClassSlots.map(s => (
              <Text key={s.weekday}>{cap(WEEKDAY_LONG[s.weekday])} {hourLabel(s.startHour)} · {s.court.name} · {s.coach.firstName}</Text>
            ))}
          </div>
          <div className={css.block}><Button label="Abrir grupo y asignar" variant="primary" width="100%" onClick={openNew} /></div>
        </>
      )}
      {result.proposals.length === 0 && result.newClassSlots.length === 0 && student.level !== null && (
        <p className={css.empty}>No hay pista o entrenador libre en su disponibilidad. Habla con la familia para ampliar los días.</p>
      )}
    </div>
  );
}

// ── One class on one date ──────────────────────────────────────────────────
function ClassPanel({data, ix, model, ui}: PanelProps) {
  const notify = useNotify();
  const cls = ix.cls.get(ui.selectedClassId!)!;
  const date = addDays(ui.weekMonday, cls.weekday - 1);
  const s: Session = sessionOf(data, ix, cls, date);
  const [scope, setScope] = useState<'session' | 'season'>('session');
  const week = seasonWeekNumber(data.academy.season.start, date);
  const program = programFor(cls.sport, cls.level, week);
  const rain = s.court.covered ? null : model.rainAt(date, cls.startHour, cls.locationId);
  const busy = (coachId: string) => data.classes.some(c => c.id !== cls.id && c.coachId === coachId && c.weekday === cls.weekday && c.startHour === cls.startHour);
  const coachOptions = data.coaches
    .filter(c => c.sports.includes(cls.sport))
    .map(c => ({
      value: c.id,
      label: `${c.firstName} ${c.lastName}`,
      description: busy(c.id) ? 'Tiene otra clase a esta hora' : c.locationId === cls.locationId ? (c.isLead ? 'Referente de la sede' : 'De esta sede') : `De ${ix.location.get(c.locationId)!.short}`,
      disabled: busy(c.id),
    }));

  return (
    <div className={css.panel} data-level={cls.level}>
      <div className={css.levelBar} />
      <PanelHeader
        title={`${s.levels.map(l => LEVEL_LABEL[l]).join(' + ')} · ${GROUP_LABEL[cls.group]}`}
        subtitle={`${sportPrefix(cls.sport)}${s.levels.length > 1 ? 'grupo mixto' : `bola ${LEVEL_BALL[cls.level]}`}`}
        onBack={ui.focusStudentId ? () => setUI({selectedClassId: null}) : undefined}
        onClose={() => setUI({selectedClassId: null})}
      />
      <dl className={css.facts}>
        <div><dt>Cuándo</dt><dd>{cap(WEEKDAY_LONG[cls.weekday])} {dayMonth(date)}, {hourLabel(cls.startHour)}–{hourLabel(cls.startHour + 1)}</dd></div>
        <div><dt>Dónde</dt><dd>{s.court.name}, {ix.location.get(cls.locationId)!.name} · {s.court.covered ? 'cubierta' : 'aire libre'}</dd></div>
        <div><dt>Programa</dt><dd>Semana {week}: {program.title}<span className={css.goal}>{program.goal}</span></dd></div>
      </dl>

      {s.cancelled ? (
        <div className={css.block}>
          <Banner status="info" icon={<Umbrella size={16} />} title="Cancelada por lluvia" description="Cada alumno tiene una recuperación pendiente."
            endContent={<Button label="Reactivar" size="sm" variant="secondary" onClick={() => { restoreSession(cls.id, date); notify('Clase reactivada', {canUndo: true}); }} />} />
        </div>
      ) : rain !== null && rain >= 30 ? (
        <div className={css.rainBox} data-wet={rain >= 60 || undefined}>
          <CloudRain size={18} />
          <span><strong>{rain}% de lluvia</strong> a las {hourLabel(cls.startHour)}</span>
          <Button label="Cancelar por lluvia" size="sm" variant="secondary" onClick={() => {
            const n = cancelForRain([{classId: cls.id, date}]);
            const capped = s.students.length - n;
            notify(`Clase cancelada. ${n} ${n === 1 ? 'recuperación creada' : 'recuperaciones creadas'}${capped > 0 ? `; ${capped} ya en el máximo de la temporada` : ''}`, {canUndo: true});
          }} />
        </div>
      ) : null}

      <h4 className={css.sectionTitle}>Entrenador</h4>
      <div className={css.block}>
        <Selector label="Entrenador" isLabelHidden options={coachOptions} value={s.coach.id} width="100%"
          onChange={v => {
            if (!v || v === s.coach.id) return;
            setCoach(cls.id, v, scope === 'season' ? {kind: 'season'} : {kind: 'session', date});
            notify(`${ix.coach.get(v)!.firstName} da esta clase ${scope === 'season' ? 'toda la temporada' : 'esta semana'}`, {canUndo: true});
          }} />
        <SegmentedControl label="Alcance del cambio" value={scope} onChange={v => setScope(v as 'session' | 'season')} size="sm" layout="fill">
          <SegmentedControlItem value="session" label="Solo esta semana" />
          <SegmentedControlItem value="season" label="Toda la temporada" />
        </SegmentedControl>
        {s.isSubstitute && <Text type="supporting" color="secondary">Sustituye a {ix.coach.get(cls.coachId)!.firstName} esta semana.</Text>}
      </div>

      <h4 className={css.sectionTitle}>Alumnos <span className={css.count}>{s.students.length + s.guests.length}/{cls.capacity}</span></h4>
      <ul className={css.list}>
        {s.students.map(st => {
          const absence = data.absences.find(a => a.studentId === st.id && a.classId === cls.id && a.date === date);
          const value = !absence ? 'in' : absence.reason === 'medical' ? 'medical' : 'other';
          return (
            <li key={st.id} className={css.rosterRow} data-me={st.id === ui.focusStudentId || undefined}>
              <button type="button" className={css.person} onClick={() => focusStudent(st.id, [...new Set(classesOf(ix, st.id, ui.weekMonday).map(c => c.locationId))])}>
                <Avatar name={fullName(st)} size="sm" />
                <span className={css.rowMain}>
                  <span className={css.rowTitle} data-absent={!!absence || undefined}>{fullName(st)}</span>
                  <span className={css.rowSub}>{ageOn(st.birthDate, date)} años{st.level && st.level !== cls.level ? ` · ${LEVEL_LABEL[st.level].toLowerCase()}` : ''}</span>
                </span>
              </button>
              <Selector label={`Asistencia de ${st.firstName}`} isLabelHidden size="sm" variant="ghost" value={value}
                options={[
                  {value: 'in', label: 'Asiste'},
                  {value: 'medical', label: 'Falta, con certificado', description: 'Da derecho a recuperar'},
                  {value: 'other', label: 'Falta, sin justificar', description: 'No se recupera'},
                ]}
                onChange={v => {
                  if (v === 'in') { clearAbsence(st.id, cls.id, date); return; }
                  const earns = markAbsence(st.id, cls.id, date, v as 'medical' | 'other', v === 'medical');
                  notify(earns ? `Falta anotada. ${st.firstName} tiene una recuperación` : v === 'medical' ? `Falta anotada. ${st.firstName} ya llegó al máximo de recuperaciones de la temporada` : `Falta anotada. No da derecho a recuperación`, {canUndo: true});
                }} />
            </li>
          );
        })}
        {s.guests.map(st => (
          <li key={st.id} className={css.rosterRow}>
            <span className={css.person}><Avatar name={fullName(st)} size="sm" />
              <span className={css.rowMain}><span className={css.rowTitle}>{fullName(st)}</span><span className={css.rowSub}>Recupera una clase</span></span>
            </span>
          </li>
        ))}
        {Array.from({length: s.free}, (_, i) => <li key={i} className={css.freeSeat}>Plaza libre</li>)}
      </ul>
    </div>
  );
}

// ── One student ────────────────────────────────────────────────────────────
function CreditRow({credit, student, data, ix, model, ui}: PanelProps & {credit: MakeupCredit; student: Student}) {
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const mine = new Set(classesOf(ix, student.id, ui.weekMonday).map(c => c.id));
  const until = creditExpiry(data, credit);
  const expired = isExpired(data, credit, ui.today);
  const options = model.sessions
    .filter(s => s.cls.sport === student.sport && s.cls.group === student.group && s.cls.level === student.level && s.free > 0 && !s.cancelled && s.date >= ui.today && s.date > credit.originDate && (until === null || s.date <= until) && !mine.has(s.cls.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.cls.startHour - b.cls.startHour);
  useEffect(() => {
    setUI({highlight: open ? options.map(o => o.cls.id) : []});
    return () => setUI({highlight: []});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (credit.status === 'booked') {
    const c = ix.cls.get(credit.bookedClassId!)!;
    return <li className={css.rowStatic}><span className={css.rowMain}><span className={css.rowTitle}>Recupera el {dayMonth(credit.bookedDate!)} a las {hourLabel(c.startHour)}</span><span className={css.rowSub}>{ix.court.get(c.courtId)!.name}, {ix.location.get(c.locationId)!.short}</span></span></li>;
  }
  return (
    <li className={css.credit}>
      <div className={css.rowStatic}>
        <span className={css.rowMain}>
          <span className={css.rowTitle}>{credit.reason === 'weather' ? 'Clase cancelada por lluvia' : 'Falta con certificado médico'}</span>
          <span className={css.rowSub}>Clase del {dayMonth(credit.originDate)} · {expired ? `caducó el ${dayMonth(until!)}` : until ? `caduca el ${dayMonth(until)}` : 'no caduca'}</span>
        </span>
        {!expired && <Button label={open ? 'Cerrar' : 'Reservar'} size="sm" variant="secondary" onClick={() => setOpen(o => !o)} />}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className={css.creditOptions} initial={{opacity: 0, height: 0}} animate={{opacity: 1, height: 'auto'}} exit={{opacity: 0, height: 0}} transition={{duration: 0.2}}>
            {options.length === 0 && <p className={css.empty}>Esta semana no hay plazas libres de su nivel{until && until < addDays(ui.weekMonday, 7) ? ' antes de que caduque' : '. Prueba la semana siguiente'}.</p>}
            {options.map(o => (
              <button key={o.cls.id} type="button" className={css.option} onClick={() => {
                bookCredit(credit.id, o.cls.id, o.date);
                notify(`${student.firstName} recupera el ${WEEKDAY_LONG[o.cls.weekday]} a las ${hourLabel(o.cls.startHour)}`, {canUndo: true});
              }}>
                <span>{cap(WEEKDAY_LONG[o.cls.weekday])} {dayMonth(o.date)} · {hourLabel(o.cls.startHour)}</span>
                <span className={css.rowSub}>{o.court.name}, {ix.location.get(o.cls.locationId)!.short} · {o.coach.firstName} · {o.free} {o.free === 1 ? 'plaza' : 'plazas'}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function StudentPanel(p: PanelProps) {
  const {data, ix, ui} = p;
  const s = ix.student.get(ui.focusStudentId!)!;
  const family = ix.family.get(s.familyId)!;
  const members = (ix.familyMembers.get(s.familyId) ?? []).filter(m => m.id !== s.id);
  const classes = classesOf(ix, s.id, ui.weekMonday);
  const credits = data.credits.filter(c => c.studentId === s.id && (c.status === 'open' || (c.bookedDate ?? '') >= ui.weekMonday));
  const holderIsStudent = family.holderStudentId === s.id;
  return (
    <div className={css.panel}>
      <PanelHeader title={fullName(s)} subtitle={<LevelTag s={s} />} onClose={clearFocus} />
      <dl className={css.facts}>
        <div><dt>Edad</dt><dd>{ageOn(s.birthDate, ui.today)} años</dd></div>
        <div><dt>Puede venir</dt><dd>{availabilityLine(s)}</dd></div>
        <div><dt>Contacto</dt><dd>{holderIsStudent ? '' : `${family.holderName} · `}{family.phone}<span className={css.goal}>{family.email}</span></dd></div>
      </dl>

      <h4 className={css.sectionTitle}>Horario semanal</h4>
      {classes.length === 0 ? (
        <div className={css.block}>
          <Text color="secondary">{s.status === 'trial' ? `Clase de prueba el ${dayMonth(s.trialDate)}. Después se evalúa su nivel.` : 'Todavía sin horario.'}</Text>
          {s.status === 'pending' && <Button label="Proponer horario" variant="primary" onClick={() => setUI({allocStudentId: s.id, focusStudentId: null})} />}
        </div>
      ) : (
        <ul className={css.list}>
          {classes.map((c: ClassTemplate) => (
            <li key={c.id}>
              <button type="button" className={css.rowButton} data-level={c.level} onClick={() => setUI({selectedClassId: c.id})}>
                <span className={css.dayBadge}>{WEEKDAY_SHORT[c.weekday]}</span>
                <span className={css.rowMain}>
                  <span className={css.rowTitle}>{hourLabel(c.startHour)} · {ix.court.get(c.courtId)!.name}, {ix.location.get(c.locationId)!.short}</span>
                  <span className={css.rowSub}>Con {ix.coach.get(c.coachId)!.firstName} {ix.coach.get(c.coachId)!.lastName}</span>
                </span>
                <span className={css.rowAction}>Abrir</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {credits.length > 0 && (
        <>
          <h4 className={css.sectionTitle}>Recuperaciones <span className={css.count}>{credits.filter(c => c.status === 'open' && !isExpired(data, c, ui.today)).length}</span></h4>
          <ul className={css.list}>{credits.map(c => <CreditRow key={c.id} {...p} credit={c} student={s} />)}</ul>
        </>
      )}

      <h4 className={css.sectionTitle}>{family.name}</h4>
      {members.length === 0 && !holderIsStudent && <p className={css.empty}>Titular: {family.holderName}</p>}
      {members.length === 0 && holderIsStudent && <p className={css.empty}>Es titular de su cuenta. Sin más familiares en la academia.</p>}
      <ul className={css.list}>
        {members.map(m => {
          const mc = classesOf(ix, m.id, ui.weekMonday);
          return (
            <li key={m.id}>
              <button type="button" className={css.rowButton} onClick={() => focusStudent(m.id, [...new Set(mc.map(c => c.locationId))])}>
                <Avatar name={fullName(m)} size="sm" />
                <span className={css.rowMain}>
                  <span className={css.rowTitle}>{m.firstName}{family.holderStudentId === m.id ? ' · titular' : ''}</span>
                  <span className={css.rowSub}>{mc.length ? describeClasses(ix, mc) : 'Sin horario'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function inspectorKey(ui: UIState): string {
  if (ui.allocStudentId) return `alloc-${ui.allocStudentId}`;
  if (ui.selectedClassId) return `class-${ui.selectedClassId}`;
  if (ui.focusStudentId) return `student-${ui.focusStudentId}`;
  return 'queue';
}

export function Inspector(p: PanelProps) {
  const key = inspectorKey(p.ui);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={key} className={css.swap} initial={{opacity: 0, x: 8}} animate={{opacity: 1, x: 0}} exit={{opacity: 0}} transition={{duration: 0.16, ease: 'easeOut'}}>
        {key.startsWith('alloc') ? <AllocationPanel {...p} /> : key.startsWith('class') ? <ClassPanel {...p} /> : key.startsWith('student') ? <StudentPanel {...p} /> : <QueuePanel {...p} />}
      </motion.div>
    </AnimatePresence>
  );
}
