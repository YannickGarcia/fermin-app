'use client';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {isExpired, updateAcademy, useData} from '@/lib/data/store';
import {WEEKDAY_LONG, hourLabel, joinY} from '@/lib/domain/labels';
import {dayMonth} from '@/lib/dates';
import {useUI} from '@/lib/ui/state';
import {useNotify} from '@/components/calendar/useNotify';
import css from './settings.module.css';

const EXPIRY = [
  {value: 'never', label: 'No caducan'},
  {value: '30', label: 'A los 30 días'},
  {value: '60', label: 'A los 60 días'},
  {value: '90', label: 'A los 90 días'},
  {value: '180', label: 'A los 180 días'},
];

export default function SettingsScreen() {
  const data = useData();
  const ui = useUI();
  const notify = useNotify();
  const a = data.academy;
  const open = data.credits.filter(c => c.status === 'open');
  const expired = open.filter(c => isExpired(data, c, ui.today)).length;

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h1>Ajustes</h1>
        <p>{a.name} · {a.season.label}</p>
      </header>

      <section className={css.section}>
        <div className={css.sectionText}>
          <h2>Recuperaciones</h2>
          <p>Una clase se recupera solo si se canceló por lluvia o si el alumno faltó con certificado médico.</p>
        </div>
        <div className={css.fields}>
          <Selector
            label="Caducidad de las recuperaciones"
            description="Se cuenta desde el día de la clase perdida y se aplica también a las que ya están pendientes."
            options={EXPIRY}
            value={a.makeupExpiryDays === null ? 'never' : String(a.makeupExpiryDays)}
            width={320}
            onChange={v => {
              if (!v) return;
              updateAcademy({makeupExpiryDays: v === 'never' ? null : Number(v)});
              notify(v === 'never' ? 'Las recuperaciones ya no caducan' : `Las recuperaciones caducan a los ${v} días`, {canUndo: true});
            }}
          />
          <Selector
            label="Máximo de recuperaciones por alumno y temporada"
            description="Al llegar al máximo, una clase cancelada o una falta con certificado ya no genera recuperación."
            options={[{value: 'none', label: 'Sin límite'}, ...[2, 3, 4, 5, 6, 8, 10].map(n => ({value: String(n), label: `${n} por temporada`}))]}
            value={a.makeupCapPerSeason === null ? 'none' : String(a.makeupCapPerSeason)}
            width={320}
            onChange={v => {
              if (!v) return;
              updateAcademy({makeupCapPerSeason: v === 'none' ? null : Number(v)});
              notify(v === 'none' ? 'Recuperaciones sin límite' : `Máximo de ${v} recuperaciones por alumno y temporada`, {canUndo: true});
            }}
          />
          <p className={css.note}>
            {open.length - expired} pendientes ahora{expired ? `, ${expired} caducadas con este plazo` : ''}.
          </p>
        </div>
      </section>

      <section className={css.section}>
        <div className={css.sectionText}>
          <h2>Grupos pequeños</h2>
          <p>Cuando un grupo no llega al mínimo, puede completarse con alumnos del nivel de al lado.</p>
        </div>
        <div className={css.fields}>
          <Switch
            label="Mezclar niveles contiguos"
            description="Fermín lo propone solo si no hay un grupo de su nivel que encaje mejor."
            value={a.mixLevels.enabled}
            onChange={v => {
              updateAcademy({mixLevels: {...a.mixLevels, enabled: v}});
              notify(v ? 'Se pueden mezclar niveles contiguos' : 'Los grupos vuelven a ser de un solo nivel', {canUndo: true});
            }}
          />
          <Selector
            label="Un grupo es pequeño cuando tiene"
            options={[1, 2, 3].map(n => ({value: String(n), label: n === 1 ? '1 alumno' : `${n} alumnos o menos`}))}
            value={String(a.mixLevels.maxGroupSize)}
            isDisabled={!a.mixLevels.enabled}
            width={320}
            onChange={v => v && updateAcademy({mixLevels: {...a.mixLevels, maxGroupSize: Number(v)}})}
          />
        </div>
      </section>

      <section className={css.section}>
        <div className={css.sectionText}>
          <h2>Horario de la academia</h2>
          <p>Estos valores se editarán aquí cuando la academia esté conectada a la base de datos.</p>
        </div>
        <dl className={css.facts}>
          <div><dt>Días de clase</dt><dd>{joinY(a.openWeekdays.map(w => WEEKDAY_LONG[w]))}</dd></div>
          <div><dt>Franja</dt><dd>{hourLabel(a.dayStartHour)}–{hourLabel(a.dayEndHour)}, clases de {a.classDurationMin} minutos</dd></div>
          <div><dt>Temporada</dt><dd>Del {dayMonth(a.season.start)} al {dayMonth(a.season.end)}</dd></div>
        </dl>
      </section>
    </div>
  );
}
