/**
 * The training programme: every week of the season has a theme per sport, so
 * all groups follow the same logical progression and a make-up class in
 * another group still covers the same content. Levels change the goal, not
 * the theme.
 */
import type {ISODate, Level, ProgramWeek, Sport} from './types';
import {diffDays, mondayOf} from '../dates';

type Block = {block: string; weeks: Array<[title: string, goals: [string, string, string, string]]>};

const TENNIS: Block[] = [
  {block: 'Fondo de pista', weeks: [
    ['Derecha: control y dirección', ['Peloteo de 6 golpes en el cuadro de saque', 'Cruzado y paralelo con margen', 'Cambio de dirección sin perder profundidad', 'Derecha invertida para abrir pista']],
    ['Revés: preparación y apoyo', ['Revés a dos manos con punto de impacto delante', 'Revés cruzado profundo', 'Revés paralelo en carrera', 'Revés cortado para cambiar el ritmo']],
    ['Profundidad y altura', ['Pasar la red con altura segura', 'Bola profunda tras bote alto', 'Alternar liftado y plano', 'Defender y contraatacar desde el fondo']],
    ['Juego de piernas', ['Posición de espera y split step', 'Recuperar al centro tras cada golpe', 'Pasos de ajuste y apoyo abierto', 'Apoyos en carrera y deslizamiento']],
  ]},
  {block: 'Saque y resto', weeks: [
    ['Saque: lanzamiento y ritmo', ['Lanzamiento estable y saque por abajo o arriba', 'Primer saque con dirección', 'Segundo saque liftado', 'Saque abierto y al cuerpo según el rival']],
    ['Resto', ['Devolver dentro con media preparación', 'Resto cruzado profundo', 'Resto agresivo sobre segundo saque', 'Resto y subida']],
    ['Saque + primer golpe', ['Sacar y prepararse para la siguiente bola', 'Saque y derecha al lado abierto', 'Patrones saque-golpe', 'Saque-volea y variaciones']],
  ]},
  {block: 'Red', weeks: [
    ['Volea: bloqueo y posición', ['Volea de bloqueo cerca de la red', 'Volea profunda de derecha y revés', 'Volea baja y media volea', 'Volea de definición en ángulo']],
    ['Remate y globo', ['Remate con bote', 'Remate sin bote desde media pista', 'Globo defensivo y remate en salto', 'Globo liftado ofensivo']],
    ['Subir a la red', ['Golpe de aproximación corto', 'Aproximación paralela y cierre', 'Elegir la bola para subir', 'Transición en dos golpes bajo presión']],
  ]},
  {block: 'Táctica y competición', weeks: [
    ['Construir el punto', ['Mantener la bola en juego', 'Jugar al revés del rival', 'Abrir pista y cerrar', 'Patrones según marcador']],
    ['Dobles', ['Posiciones básicas en dobles', 'Comunicación y cruce', 'Formación australiana', 'Restos y poaching']],
    ['Partidos dirigidos', ['Tie-breaks con normas adaptadas', 'Sets cortos con objetivo táctico', 'Sets con desventaja', 'Competición interna']],
  ]},
];

const PADEL: Block[] = [
  {block: 'Fundamentos', weeks: [
    ['Derecha y revés de fondo', ['Golpes de fondo sin pared', 'Dirección al centro y cruzado', 'Bola baja a los pies', 'Chiquita para ganar la red']],
    ['Salida de pared de fondo', ['Dejar pasar y golpear tras pared', 'Salida de pared con globo', 'Bajada de pared', 'Bajada de pared ofensiva']],
    ['Globo', ['Globo alto al centro', 'Globo cruzado profundo', 'Globo tras pared', 'Globo de ataque para recuperar la red']],
  ]},
  {block: 'Red', weeks: [
    ['Volea', ['Volea de bloqueo', 'Volea profunda al cristal', 'Volea a la reja', 'Volea de definición']],
    ['Bandeja', ['Bandeja con bote', 'Bandeja cruzada', 'Bandeja y recuperación de red', 'Víbora']],
    ['Remate', ['Remate de seguridad', 'Remate al cristal', 'Remate por tres', 'Remate de traer']],
  ]},
  {block: 'Juego en pareja', weeks: [
    ['Posiciones y basculación', ['Moverse juntos', 'Bascular con la bola', 'Cubrir el centro', 'Cambios de lado bajo presión']],
    ['Saque y resto', ['Saque seguro y subida', 'Resto al pie del voleador', 'Resto con globo', 'Australiana']],
    ['Partidos dirigidos', ['Juegos con normas adaptadas', 'Sets con objetivo táctico', 'Puntos de oro', 'Competición interna']],
  ]},
];

const PICKLEBALL: Block[] = [
  {block: 'Fundamentos', weeks: [
    ['Dink y zona de no volea', ['Dink recto', 'Dink cruzado', 'Dink con dirección', 'Dink ofensivo']],
    ['Saque y resto profundo', ['Saque dentro', 'Saque profundo', 'Resto profundo y subida', 'Saque con efecto']],
    ['Tercer golpe', ['Tercera bola alta y segura', 'Drop al centro', 'Drop cruzado', 'Drive o drop según el resto']],
  ]},
  {block: 'Juego en la red', weeks: [
    ['Volea y bloqueo', ['Volea de bloqueo', 'Reset desde media pista', 'Volea de ataque', 'Manos rápidas']],
    ['Transición', ['Avanzar tras el drop', 'Parar en la zona de transición', 'Reset bajo presión', 'Contraataque']],
    ['Partidos dirigidos', ['Juegos a 7', 'Dobles con objetivo', 'Stacking básico', 'Competición interna']],
  ]},
];

const PROGRAMS: Record<Sport, Block[]> = {tennis: TENNIS, padel: PADEL, pickleball: PICKLEBALL};

export function seasonWeekNumber(seasonStart: ISODate, date: ISODate): number {
  return Math.floor(diffDays(mondayOf(date), mondayOf(seasonStart)) / 7) + 1;
}

export function programFor(sport: Sport, level: Level, weekNumber: number): ProgramWeek {
  const flat = PROGRAMS[sport].flatMap(b => b.weeks.map(w => ({block: b.block, title: w[0], goals: w[1]})));
  const w = flat[(((weekNumber - 1) % flat.length) + flat.length) % flat.length];
  return {weekNumber, block: w.block, title: w.title, goal: w.goals[level - 1]};
}
