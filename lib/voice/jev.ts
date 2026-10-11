/**
 * Jev interpreter (TypeSafe AI, https://docs.typesafe.ai).
 *
 * Jev is a "System One" model: it does not write text. It takes a state and a
 * set of typed questions and returns, for each one, a decision with calibrated
 * probabilities, all in one parallel call (roughly 70–500 ms). That is exactly
 * the shape of a voice command here: every slot is a pick from things that
 * already exist in the academy, so the model cannot invent a student, a day
 * or a coach.
 *
 *   Choice → intent, which student, which coach, hour, location, scope
 *   Noul   → one yes/no per weekday, for "leaves" and for "attends after"
 *
 * The answers become `Slots`; `resolveSlots` (parse.ts) then checks them
 * against the calendar. Low-confidence slots are reported as doubts instead
 * of being guessed.
 *
 * NOT YET RUN AGAINST THE LIVE API: written from the public docs. The request
 * and response shapes follow docs.typesafe.ai/introduction/quickstart.
 */
import type {Weekday} from '../domain/types';
import type {Slots} from './parse';

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';
/** Below this a Choice is treated as "not sure". */
export const CHOICE_MIN = 0.6;
/** A Noul at or above YES counts as yes; between NO and YES it is a doubt. */
export const NOUL_YES = 0.7;
export const NOUL_NO = 0.3;
/** Choice accepts up to 255 options; one is kept for "none". */
const MAX_OPTIONS = 254;

export interface JevContext {
  students: Array<{id: string; name: string}>;
  coaches: Array<{id: string; name: string}>;
  locations: Array<{id: string; name: string}>;
  /** e.g. "sábado" */
  todayName: string;
}

type ChoiceQ = {type: 'choice'; instructions: string; criteria: Record<string, string>};
type NoulQ = {type: 'noul'; instructions: string};
export interface JevRequest {
  state: {utterance: string; today: string; language: string};
  model: string;
  questions: Record<string, ChoiceQ | NoulQ>;
}
type ChoiceA = {type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number>};
type NoulA = {type: 'noul'; noul: number};
export interface JevResponse {
  model: string;
  answers: Record<string, ChoiceA | NoulA>;
  usage?: {input_tokens: number; output_tokens: number};
}

const DAYS: Array<[Weekday, string]> = [[1, 'Monday / lunes'], [2, 'Tuesday / martes'], [3, 'Wednesday / miércoles'], [4, 'Thursday / jueves'], [5, 'Friday / viernes']];
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const NOT_NAMES = new Set(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'clase', 'clases', 'hora', 'misma', 'cambia', 'pasa', 'ponla', 'pon', 'para', 'por', 'los', 'las', 'del', 'vez', 'lluvia', 'cancela', 'siempre', 'semana']);

function editDistance(a: string, b: string): number {
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Speech recognition misspells names ("Sara" for "Sarah"). Keep every student
 * whose first name or surname is within a typo of a word in the sentence; if
 * nobody is close, send the whole roster (up to the Choice limit).
 */
export function shortlist<T extends {id: string; name: string}>(utterance: string, people: T[], max = 40): T[] {
  const words = plain(utterance).split(/[^a-z]+/).filter(w => w.length >= 3 && !NOT_NAMES.has(w));
  const close = people.filter(p =>
    plain(p.name).split(' ').some(part => words.some(w => w[0] === part[0] && editDistance(w, part) <= (part.length >= 8 ? 2 : 1))),
  );
  return (close.length ? close.slice(0, max) : people).slice(0, MAX_OPTIONS);
}

export function buildJevRequest(utterance: string, ctx: JevContext): JevRequest {
  const options = (list: Array<{id: string; name: string}>, none: string) =>
    Object.fromEntries([...list.map(p => [p.id, p.name] as const), ['none', none]]);
  const questions: JevRequest['questions'] = {
    intent: {
      type: 'choice',
      instructions: 'An academy manager gave this instruction about the class calendar. What do they want to do?',
      criteria: {
        move: 'Change which weekdays or what time a student attends their weekly classes',
        coach: 'Put a different coach on a class, as a substitute or permanently',
        rain: 'Cancel classes because of rain or bad weather',
        focus: 'Only find or look at a person; no change is requested',
        unknown: 'Something else, or not clear',
      },
    },
    student: {type: 'choice', instructions: 'Which student is the instruction about?', criteria: options(shortlist(utterance, ctx.students), 'No student is named, or none of these')},
    coach: {type: 'choice', instructions: 'Which coach should take the class? Only answer with a coach if the instruction asks to assign one.', criteria: options(ctx.coaches, 'No coach is being assigned')},
    day: {
      type: 'choice',
      instructions: 'If the instruction is about one specific day (the class to give to another coach, or the day to cancel), which day is it?',
      criteria: {...Object.fromEntries(DAYS.map(([d, n]) => [`d${d}`, n])), today: 'Today / hoy', tomorrow: 'Tomorrow / mañana', none: 'No single day, or the instruction moves a student between days'},
    },
    hour: {
      type: 'choice',
      instructions: 'What start time should the student have after the change?',
      criteria: {
        same: 'Explicitly the same time as now ("misma hora", "same time")',
        ...Object.fromEntries([15, 16, 17, 18, 19, 20, 21].map(h => [`h${h}`, `${h}:00 (${h - 12} pm)`])),
        unspecified: 'No time is mentioned',
      },
    },
    location: {type: 'choice', instructions: 'Which academy location does the instruction name?', criteria: options(ctx.locations, 'No location is named')},
    scope: {
      type: 'choice',
      instructions: 'Is the change for one session only or for the rest of the season?',
      criteria: {session: 'Just this once, this week, or not stated', season: 'Always, permanently, every week, the whole season ("siempre", "toda la temporada")'},
    },
  };
  for (const [d, name] of DAYS) {
    questions[`from_${d}`] = {type: 'noul', instructions: `The instruction says the student currently attends on ${name} and that this is part of the schedule being changed.`};
    questions[`to_${d}`] = {type: 'noul', instructions: `After the change, the student should attend on ${name}.`};
  }
  return {state: {utterance, today: ctx.todayName, language: 'Spanish or English, possibly from speech recognition'}, model: JEV_MODEL, questions};
}

const LABEL: Record<string, string> = {intent: 'qué quieres hacer', student: 'el alumno', coach: 'el entrenador', day: 'el día', hour: 'la hora', location: 'la sede'};

export function slotsFromJev(res: JevResponse): Slots {
  const doubts: string[] = [];
  const choice = (id: string, needed = true): string | null => {
    const a = res.answers[id];
    if (!a || a.type !== 'choice') return null;
    if (a.confidence < CHOICE_MIN) {
      if (needed) doubts.push(`No estoy seguro de ${LABEL[id] ?? id}`);
      return null;
    }
    return a.choice;
  };
  const days = (prefix: string, label: string): Weekday[] => {
    const out: Weekday[] = [];
    for (const [d, name] of DAYS) {
      const a = res.answers[`${prefix}_${d}`];
      if (!a || a.type !== 'noul') continue;
      if (a.noul >= NOUL_YES) out.push(d);
      else if (a.noul > NOUL_NO) doubts.push(`No estoy seguro de si ${label} el ${name.split(' / ')[1]}`);
    }
    return out;
  };

  const intent = (choice('intent') ?? 'unknown') as Slots['intent'];
  const student = choice('student', intent !== 'rain');
  // When the model hesitates between a few students, offer them instead of picking.
  const sa = res.answers.student;
  const near = sa?.type === 'choice' && !student
    ? Object.entries(sa.probabilities).filter(([k, p]) => k !== 'none' && p >= 0.15).sort((a, b) => b[1] - a[1]).map(([k]) => k)
    : [];
  const coach = intent === 'coach' ? choice('coach') : null;
  const day = choice('day', intent === 'rain');
  const hour = choice('hour', false);
  const location = choice('location', false);
  const isMove = intent === 'move';

  return {
    intent,
    studentIds: student && student !== 'none' ? [student] : near,
    coachId: coach && coach !== 'none' ? coach : null,
    fromDays: isMove ? days('from', 'deja') : [],
    toDays: isMove ? days('to', 'va') : [],
    day: !day || day === 'none' ? null : day === 'today' || day === 'tomorrow' ? day : (Number(day.slice(1)) as Weekday),
    hour: !hour || hour === 'unspecified' ? null : hour === 'same' ? 'same' : Number(hour.slice(1)),
    locationId: location && location !== 'none' ? location : null,
    scope: choice('scope', false) === 'season' ? 'season' : 'session',
    doubts,
  };
}
