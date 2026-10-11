'use client';
import {useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Users} from 'lucide-react';
import {TextInput} from '@astryxdesign/core/TextInput';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {classesOf, useData, useIndex} from '@/lib/data/store';
import {GROUP_LABEL, LEVEL_LABEL, sportPrefix} from '@/lib/domain/labels';
import {describeClasses} from '@/lib/scheduling/allocate';
import {norm} from '@/lib/voice/parse';
import {ageOn} from '@/lib/dates';
import {focusStudent, setUI, useUI} from '@/lib/ui/state';
import css from './students.module.css';

const STATUS: Record<string, string> = {active: 'Con horario', pending: 'Sin asignar', trial: 'Clase de prueba'};

export default function StudentsScreen() {
  const data = useData();
  const ix = useIndex(data);
  const ui = useUI();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  const students = useMemo(() => {
    const words = norm(q).split(' ').filter(Boolean);
    return data.students
      .filter(s => status === 'all' || s.status === status)
      .filter(s => {
        if (!words.length) return true;
        const hay = norm(`${s.firstName} ${s.lastName} ${ix.family.get(s.familyId)!.holderName}`).split(' ');
        return words.every(w => hay.some(h => h.startsWith(w)));
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'es') || a.firstName.localeCompare(b.firstName, 'es'));
  }, [data, ix, q, status]);

  const open = (id: string) => {
    const s = ix.student.get(id)!;
    if (s.status === 'pending') setUI({allocStudentId: id, focusStudentId: null, selectedClassId: null});
    else focusStudent(id, [...new Set(classesOf(ix, id, ui.weekMonday).map(c => c.locationId))]);
    router.push('/');
  };

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1>Alumnos</h1>
          <p>{students.length} {students.length === 1 ? 'alumno' : 'alumnos'}</p>
        </div>
        <div className={css.controls}>
          <SegmentedControl label="Estado" value={status} onChange={setStatus} size="sm">
            <SegmentedControlItem value="all" label="Todos" />
            <SegmentedControlItem value="active" label="Con horario" />
            <SegmentedControlItem value="pending" label="Sin asignar" />
            <SegmentedControlItem value="trial" label="Prueba" />
          </SegmentedControl>
          <TextInput label="Buscar" isLabelHidden placeholder="Nombre, apellido o contacto" startIcon="search" hasClear value={q} onChange={setQ} width={280} />
        </div>
      </header>

      {students.length === 0 && <p className={css.empty}>Nadie coincide con esa búsqueda.</p>}
      <ul className={css.list}>
        {students.map(s => {
          const family = ix.family.get(s.familyId)!;
          const others = (ix.familyMembers.get(s.familyId) ?? []).filter(m => m.id !== s.id);
          const classes = classesOf(ix, s.id, ui.weekMonday);
          return (
            <li key={s.id}>
              <button type="button" className={css.row} data-level={s.level ?? undefined} onClick={() => open(s.id)}>
                <span className={css.ball} />
                <span className={css.who}>
                  <span className={css.name}>{s.firstName} {s.lastName}</span>
                  <span className={css.contact}>
                    {family.holderStudentId === s.id ? family.phone : `${family.holderName} · ${family.phone}`}
                    {others.length > 0 && (
                      <span className={css.family} title="Misma familia">
                        <Users size={12} aria-label="Misma familia" />
                        {others.map(m => m.firstName).join(', ')}
                      </span>
                    )}
                  </span>
                </span>
                <span className={css.meta}>{ageOn(s.birthDate, ui.today)} años</span>
                <span className={css.meta}>{sportPrefix(s.sport)}{GROUP_LABEL[s.group]} · {s.level ? LEVEL_LABEL[s.level] : 'por evaluar'}</span>
                <span className={css.schedule} data-status={s.status}>{classes.length ? describeClasses(ix, classes) : STATUS[s.status]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
