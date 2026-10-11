'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {ArrowRight, CloudRain, CornerDownLeft, Mic, Search, UserRound} from 'lucide-react';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Button} from '@astryxdesign/core/Button';
import {useSpeechRecognition} from '@astryxdesign/core/Chat';
import {usePathname, useRouter} from 'next/navigation';
import {cancelForRain, classesOf, moveEnrollments, setCoach, useData, useIndex} from '@/lib/data/store';
import {type ActionDraft, type Slots, describeDraft, norm, parseCommand, resolveSlots} from '@/lib/voice/parse';
import {WEEKDAY_LONG as DAY_NAME} from '@/lib/domain/labels';
import {GROUP_LABEL, LEVEL_LABEL, WEEKDAY_LONG, hourLabel, sportPrefix} from '@/lib/domain/labels';
import {describeClasses} from '@/lib/scheduling/allocate';
import {dayMonth, mondayOf} from '@/lib/dates';
import {focusStudent, setUI, useUI} from '@/lib/ui/state';
import {useNotify} from '@/components/calendar/useNotify';
import css from './command.module.css';

const JEV_ALWAYS = process.env.NEXT_PUBLIC_JEV_MODE === 'always';

const EXAMPLES = [
  'Cambia a Sarah de martes y jueves a lunes y jueves, misma hora',
  'Cancela por lluvia el jueves en Malvarrosa',
  'Pon a Nacho en la clase de Sarah del martes',
];

export function CommandBar() {
  const ui = useUI();
  const data = useData();
  const ix = useIndex(data);
  const notify = useNotify();
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState('');
  const [pickedStudent, setPickedStudent] = useState<string | undefined>();
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const speech = useSpeechRecognition({
    lang: 'es-ES',
    interimResults: true,
    onTranscript: t => { setText(t); setPickedStudent(undefined); },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setUI(s => ({commandOpen: !s.commandOpen}));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (ui.commandOpen) {
      setText(''); setPickedStudent(undefined); setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (speech.isListening) speech.stop();
  }, [ui.commandOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo(() => ({data, ix, weekMonday: ui.weekMonday, today: ui.today, studentId: pickedStudent}), [data, ix, ui.weekMonday, ui.today, pickedStudent]);
  const ruleDraft: ActionDraft = useMemo(() => parseCommand(text, ctx), [text, ctx]);

  // Jev (lib/voice/jev.ts) interprets what the rules cannot, or everything in "always" mode.
  // The first 501 from the route means there is no API key: stop asking.
  const [jev, setJev] = useState<{text: string; slots: Slots; ms: number} | null>(null);
  const jevOff = useRef(false);
  const ruleIsClean = (ruleDraft.kind === 'move' || ruleDraft.kind === 'coach' || ruleDraft.kind === 'rain') && ruleDraft.issues.length === 0;
  const askJev = !jevOff.current && ui.commandOpen && text.trim().split(/\s+/).length >= 3 && (JEV_ALWAYS || !ruleIsClean);
  useEffect(() => {
    if (!askJev) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/interpret', {
          method: 'POST', signal: ac.signal, headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({text, context: {
            students: data.students.map(s => ({id: s.id, name: `${s.firstName} ${s.lastName}`})),
            coaches: data.coaches.map(c => ({id: c.id, name: `${c.firstName} ${c.lastName}`})),
            locations: data.locations.map(l => ({id: l.id, name: l.name})),
            todayName: DAY_NAME[(new Date(ui.today + 'T12:00').getDay() || 7) as 1],
          }}),
        });
        if (res.status === 501) { jevOff.current = true; return; }
        if (!res.ok) return;
        const json = await res.json();
        setJev({text, slots: json.slots, ms: json.ms});
      } catch { /* aborted or offline: the rules' answer stays */ }
    }, 350);
    return () => { clearTimeout(t); ac.abort(); };
  }, [text, askJev]); // eslint-disable-line react-hooks/exhaustive-deps

  const viaJev = jev && jev.text === text && jev.slots.intent !== 'unknown' ? jev : null;
  const draft: ActionDraft = useMemo(() => (viaJev ? resolveSlots(viaJev.slots, ctx) : ruleDraft), [viaJev, ruleDraft, ctx]);
  const doubts = viaJev?.slots.doubts ?? [];

  // Plain search: people whose name starts with what is being typed.
  const people = useMemo(() => {
    const q = norm(text);
    if (q.length < 2 || (draft.kind !== 'unknown' && draft.kind !== 'focus' && draft.kind !== 'ambiguous')) return [];
    const words = q.split(' ');
    return data.students
      .filter(s => {
        const name = norm(`${s.firstName} ${s.lastName}`).split(' ');
        return words.every(w => name.some(n => n.startsWith(w)));
      })
      .slice(0, 7);
  }, [text, draft.kind, data.students]);

  // Light up the classes a pending command would touch.
  useEffect(() => {
    if (!ui.commandOpen) return;
    const ids = draft.kind === 'move' ? [...draft.changes.flatMap(c => [c.from.id, c.to.id]), ...draft.keep.map(c => c.id)]
      : draft.kind === 'coach' ? [draft.cls.id]
      : draft.kind === 'rain' ? draft.sessions.map(s => s.classId) : [];
    setUI({highlight: ids});
  }, [draft, ui.commandOpen]);

  const choosing = people.length === 0 && draft.kind === 'ambiguous';
  const list = choosing ? draft.options : people;
  const pick = (id: string) => (choosing ? setPickedStudent(id) : goToStudent(id));
  const close = () => setUI({commandOpen: false, highlight: []});
  function goToStudent(id: string) {
    focusStudent(id, [...new Set(classesOf(ix, id, ui.weekMonday).map(c => c.locationId))]);
    close();
    if (pathname !== '/') router.push('/');
  }
  const from = ui.weekMonday > mondayOf(ui.today) ? ui.weekMonday : mondayOf(ui.today);
  const isAction = draft.kind === 'move' || draft.kind === 'coach' || draft.kind === 'rain';
  const canConfirm =
    (draft.kind === 'move' && draft.changes.length > 0 && draft.issues.length === 0) ||
    (draft.kind === 'coach' && draft.issues.length === 0) ||
    (draft.kind === 'rain' && draft.sessions.length > 0);

  const confirm = () => {
    if (!canConfirm) return;
    if (draft.kind === 'move') {
      moveEnrollments(draft.student.id, draft.changes.map(c => ({fromClassId: c.from.id, toClassId: c.to.id})), from);
      notify(`${describeDraft(draft, ix)}, desde el ${dayMonth(from)}`, {canUndo: true});
      focusStudent(draft.student.id, [...new Set([...draft.keep, ...draft.changes.map(c => c.to)].map(c => c.locationId))]);
    } else if (draft.kind === 'coach') {
      setCoach(draft.cls.id, draft.coach.id, draft.scope === 'season' ? {kind: 'season'} : {kind: 'session', date: draft.date});
      notify(describeDraft(draft, ix), {canUndo: true});
      setUI({selectedClassId: draft.cls.id});
    } else if (draft.kind === 'rain') {
      const n = cancelForRain(draft.sessions);
      notify(`${draft.sessions.length} clases canceladas. ${n} recuperaciones creadas`, {canUndo: true});
      const wd = new Date(draft.date + 'T12:00').getDay() || 7;
      setUI(s => ({weekMonday: mondayOf(draft.date), day: wd as 1, filters: draft.locationId ? {...s.filters, locationId: draft.locationId} : s.filters}));
    }
    setUI({commandOpen: false, highlight: []});
    if (pathname !== '/') router.push('/');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isAction) confirm();
      else if (list[cursor]) pick(list[cursor].id);
    } else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
  };

  const line = (c: {weekday: number; startHour: number; courtId: string; locationId: string}) =>
    `${WEEKDAY_LONG[c.weekday as 1]} ${hourLabel(c.startHour)} · ${ix.court.get(c.courtId)!.name}, ${ix.location.get(c.locationId)!.short}`;

  return (
    <Dialog isOpen={ui.commandOpen} onOpenChange={o => (o ? setUI({commandOpen: true}) : close())} width={640} padding={0} purpose="info">
      <div className={css.bar} onKeyDown={onKeyDown}>
        <div className={css.inputRow}>
          <Search size={18} className={css.inputIcon} aria-hidden />
          <input
            ref={inputRef} className={css.input} value={text} aria-label="Buscar o dar una orden"
            placeholder={speech.isListening ? 'Te escucho…' : 'Busca a alguien o di qué quieres cambiar'}
            onChange={e => { setText(e.target.value); setPickedStudent(undefined); setCursor(0); }}
          />
          {mounted && speech.isSupported && (
            <button type="button" className={css.mic} data-on={speech.isListening || undefined} aria-pressed={speech.isListening}
              aria-label={speech.isListening ? 'Parar de escuchar' : 'Dictar'} onClick={() => speech.toggle()}>
              <Mic size={18} />
              {speech.isListening && <span className={css.micLevel} style={{transform: `scale(${1 + speech.volume * 0.8})`}} />}
            </button>
          )}
        </div>

        <div className={css.body}>
          {text.trim() === '' && (
            <div className={css.examples}>
              <p className={css.hint}>Escribe o dicta. Fermín te enseña el cambio antes de hacerlo.</p>
              {EXAMPLES.map(e => (
                <button key={e} type="button" className={css.example} onClick={() => { setText(e); inputRef.current?.focus(); }}>
                  <ArrowRight size={14} />{e}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {isAction && (
              <motion.div key={draft.kind} className={css.draft} initial={{opacity: 0, y: 6}} animate={{opacity: 1, y: 0}} exit={{opacity: 0}} transition={{duration: 0.16}}>
                {draft.kind === 'move' && (
                  <>
                    <p className={css.draftTitle}>{describeDraft(draft, ix)}</p>
                    <p className={css.draftSub}>{draft.student.firstName} {draft.student.lastName} · {sportPrefix(draft.student.sport)}{GROUP_LABEL[draft.student.group]} · {draft.student.level ? LEVEL_LABEL[draft.student.level] : ''}</p>
                    <ul className={css.diff}>
                      {draft.changes.map(c => (
                        <li key={c.from.id}>
                          <span className={css.from}>{line(c.from)}</span>
                          <ArrowRight size={14} aria-label="pasa a" />
                          <span className={css.to}>{line(c.to)}</span>
                          {c.to.level !== draft.student.level && <span className={css.sameTag}>grupo mixto con {LEVEL_LABEL[c.to.level].toLowerCase()}</span>}
                        </li>
                      ))}
                      {draft.keep.map(c => <li key={c.id}><span className={css.same}>{line(c)}</span><span className={css.sameTag}>sin cambios</span></li>)}
                    </ul>
                    {draft.issues.length === 0 && <p className={css.draftSub}>Se aplica desde el {dayMonth(from)} y para el resto de la temporada.</p>}
                  </>
                )}
                {draft.kind === 'coach' && (
                  <>
                    <p className={css.draftTitle}>{describeDraft(draft, ix)}</p>
                    <ul className={css.diff}><li><span className={css.from}>{draft.previous.firstName} {draft.previous.lastName}</span><ArrowRight size={14} aria-label="pasa a" /><span className={css.to}>{draft.coach.firstName} {draft.coach.lastName}</span></li></ul>
                    <p className={css.draftSub}>{line(draft.cls)} · {draft.scope === 'session' ? `solo el ${dayMonth(draft.date)}. Di «siempre» para toda la temporada.` : 'toda la temporada'}</p>
                  </>
                )}
                {draft.kind === 'rain' && (
                  <>
                    <p className={css.draftTitle}><CloudRain size={16} /> {describeDraft(draft, ix)}</p>
                    <p className={css.draftSub}>{WEEKDAY_LONG[(new Date(draft.date + 'T12:00').getDay() || 7) as 1]} {dayMonth(draft.date)} · {draft.students} alumnos recibirán una recuperación. Las pistas cubiertas se mantienen.</p>
                  </>
                )}
                {draft.issues.map(i => <p key={i} className={css.issue}>{i}</p>)}
                {doubts.map(i => <p key={i} className={css.issue}>{i}. Revisa el cambio antes de confirmar.</p>)}
                {viaJev && <p className={css.via}>Interpretado por Jev en {viaJev.ms} ms</p>}
                <div className={css.draftActions}>
                  <Button label="Cancelar" variant="ghost" size="sm" onClick={close} />
                  <Button label="Confirmar" variant="primary" size="sm" isDisabled={!canConfirm} endContent={<CornerDownLeft size={14} />} onClick={confirm} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isAction && choosing && (
            <p className={css.hint}>Hay varios alumnos con ese nombre. Elige uno:</p>
          )}
          {!isAction && list.length > 0 && (
            <ul className={css.results} role="listbox" aria-label="Alumnos">
              {list.map((s, i) => {
                const classes = classesOf(ix, s.id, ui.weekMonday);
                return (
                  <li key={s.id} role="option" aria-selected={i === cursor}>
                    <button type="button" className={css.result} data-active={i === cursor || undefined} data-level={s.level ?? undefined} onMouseEnter={() => setCursor(i)} onClick={() => pick(s.id)}>
                      <UserRound size={16} className={css.inputIcon} />
                      <span className={css.resultMain}>
                        <span className={css.resultTitle}>{s.firstName} {s.lastName}</span>
                        <span className={css.resultSub}>
                          <span className={css.ball} /> {sportPrefix(s.sport)}{GROUP_LABEL[s.group]} · {s.level ? LEVEL_LABEL[s.level] : 'por evaluar'} · {classes.length ? describeClasses(ix, classes) : s.status === 'trial' ? 'clase de prueba' : 'sin horario'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!isAction && text.trim().length >= 2 && list.length === 0 && draft.kind === 'unknown' && (
            <p className={css.hint}>{draft.hint || 'No encuentro a nadie con ese nombre.'}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
