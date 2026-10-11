/**
 * Deterministic demo dataset: 1 academy, 3 locations, 16 courts, 12 coaches,
 * ~200 students grouped in families, and the weekly classes they attend.
 *
 * The classes are generated from demand (students are bucketed by location,
 * sport, group and level, then packed into weekly "tracks"), so every seeded
 * enrollment respects capacity, court and coach conflicts.
 */
import type {
  Academy, ClassTemplate, Coach, Court, Dataset, Enrollment, Family, Group, Level, Location, MakeupCredit,
  Sport, Student, Weekday,
} from '../domain/types';
import {addDays, mondayOf} from '../dates';
import {defaultCapacity, isEnabledSport} from '../domain/sports';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEMALE = ['Lucía', 'Martina', 'Sofía', 'Paula', 'Valeria', 'Julia', 'Carla', 'Noa', 'Alba', 'Emma', 'Claudia', 'Irene', 'Marta', 'Elena', 'Laura', 'Carmen', 'Nuria', 'Aitana', 'Vera', 'Olivia', 'Inés', 'Blanca', 'Rocío', 'Ana', 'Lola', 'Candela', 'Jimena', 'Adriana', 'Daniela', 'Triana', 'Mireia', 'Neus', 'Amparo', 'Sara', 'Cristina', 'Beatriz', 'Patricia', 'Silvia', 'Raquel', 'Eva'];
const MALE = ['Hugo', 'Mateo', 'Martín', 'Leo', 'Daniel', 'Pablo', 'Álvaro', 'Adrián', 'Marco', 'Diego', 'Bruno', 'Izan', 'Nicolás', 'Enzo', 'Gael', 'Javier', 'Sergio', 'Carlos', 'Jorge', 'Raúl', 'Iván', 'Rubén', 'Víctor', 'Andrés', 'Miguel', 'Alejandro', 'Guillermo', 'Óscar', 'Fernando', 'Ignacio', 'Vicent', 'Ximo', 'Ferran', 'Jaume', 'Toni', 'David', 'Luis', 'Manuel', 'Alberto', 'Samuel'];
const SURNAMES = ['García', 'Martínez', 'López', 'Sánchez', 'Navarro', 'Romero', 'Torres', 'Ruiz', 'Ramírez', 'Serrano', 'Molina', 'Blasco', 'Ferrer', 'Vidal', 'Soler', 'Pascual', 'Giménez', 'Ibáñez', 'Peris', 'Climent', 'Bosch', 'Monzó', 'Esteve', 'Roig', 'Cano', 'Marín', 'Iglesias', 'Ortega', 'Delgado', 'Castro', 'Vega', 'Herrero', 'Cabrera', 'Fuentes', 'Carrasco', 'Reyes', 'Aguilar', 'Pardo', 'Lozano', 'Gallego', 'Benet', 'Sanchis', 'Tormo', 'Llopis', 'Aparicio', 'Bellver', 'Calatayud', 'Domènech', 'Estellés', 'Furió'];

export const SEASON_START = '2026-09-14';
export const SEASON_END = '2027-06-18';

const academy: Academy = {
  id: 'aca-1',
  name: 'Academia Fermín',
  dayStartHour: 15,
  dayEndHour: 22,
  classDurationMin: 60,
  openWeekdays: [1, 2, 3, 4, 5],
  season: {id: 'season-2026', label: 'Temporada 2026–27', start: SEASON_START, end: SEASON_END},
  makeupExpiryDays: null,
  makeupCapPerSeason: null,
  mixLevels: {enabled: true, maxGroupSize: 2},
};

const locations: Location[] = [
  {id: 'loc-turia', name: 'Sede Turia', short: 'Turia', city: 'València', lat: 39.478, lon: -0.39},
  {id: 'loc-malva', name: 'Sede Malvarrosa', short: 'Malvarrosa', city: 'València', lat: 39.481, lon: -0.327},
  {id: 'loc-paterna', name: 'Sede Paterna', short: 'Paterna', city: 'Paterna', lat: 39.503, lon: -0.441},
];

const courtSpec: Array<[string, Sport, number, number]> = [
  // location, sport, count, how many of them are covered
  ['loc-turia', 'tennis', 4, 2],
  ['loc-turia', 'padel', 2, 2],
  ['loc-malva', 'tennis', 3, 0],
  ['loc-malva', 'padel', 2, 1],
  ['loc-malva', 'pickleball', 1, 0],
  ['loc-paterna', 'tennis', 2, 0],
  ['loc-paterna', 'padel', 2, 2],
  ['loc-paterna', 'pickleball', 2, 1],
];
const SPORT_PREFIX: Record<Sport, [string, string]> = {
  tennis: ['Pista', 'T'],
  padel: ['Pádel', 'P'],
  pickleball: ['Pickle', 'K'],
};

function buildCourts(): Court[] {
  const out: Court[] = [];
  for (const [locationId, sport, count, covered] of courtSpec) {
    if (!isEnabledSport(sport)) continue;
    for (let i = 1; i <= count; i++) {
      out.push({
        id: `court-${locationId.slice(4)}-${SPORT_PREFIX[sport][1].toLowerCase()}${i}`,
        locationId,
        sport,
        name: `${SPORT_PREFIX[sport][0]} ${i}`,
        short: `${SPORT_PREFIX[sport][1]}${i}`,
        covered: i <= covered,
      });
    }
  }
  return out;
}

const coachSpec: Array<[string, string, Sport[], boolean, string]> = [
  ['Marta', 'Ferrer', ['tennis'], true, 'loc-turia'],
  ['Íñigo', 'Castro', ['tennis'], false, 'loc-turia'],
  ['Paula', 'Soler', ['tennis', 'padel'], false, 'loc-turia'],
  ['Dani', 'Roig', ['padel'], false, 'loc-turia'],
  ['Nacho', 'Vidal', ['tennis'], false, 'loc-turia'],
  ['Carles', 'Peris', ['tennis'], true, 'loc-malva'],
  ['Noelia', 'Marín', ['tennis', 'pickleball'], false, 'loc-malva'],
  ['Álex', 'Bosch', ['padel'], false, 'loc-malva'],
  ['Sandra', 'Llopis', ['tennis', 'padel'], false, 'loc-malva'],
  ['Rafa', 'Ortega', ['tennis', 'padel'], true, 'loc-paterna'],
  ['Clara', 'Benet', ['padel', 'pickleball'], false, 'loc-paterna'],
  ['Hèctor', 'Tormo', ['tennis', 'pickleball'], false, 'loc-paterna'],
];


type Bucket = {
  key: string;
  locationId: string;
  sport: Sport;
  group: Group;
  level: Level;
  students: Student[];
};

export function buildDataset(seed = 20260914): Dataset {
  const rnd = mulberry32(seed);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const chance = (p: number) => rnd() < p;
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const weighted = <T,>(pairs: Array<[T, number]>): T => {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let r = rnd() * total;
    for (const [v, w] of pairs) {
      r -= w;
      if (r <= 0) return v;
    }
    return pairs[pairs.length - 1][0];
  };

  const courts = buildCourts();
  // Coaches keep their ids from the full roster; those left with no enabled sport are dropped.
  const coaches: Coach[] = coachSpec
    .map(([firstName, lastName, sports, isLead, locationId], i) => ({
      id: `coach-${i + 1}`, firstName, lastName, sports: sports.filter(isEnabledSport), isLead, locationId,
    }))
    .filter(c => c.sports.length > 0);

  // ── Families and students ────────────────────────────────────────────────
  const families: Family[] = [];
  const students: Student[] = [];
  const usedNames = new Set<string>();
  let sid = 0;

  const phone = () => `6${int(10, 99)} ${int(100, 999)} ${int(100, 999)}`;
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const firstName = () => (chance(0.5) ? pick(FEMALE) : pick(MALE));
  const birth = (minAge: number, maxAge: number) => {
    const age = int(minAge, maxAge);
    return `${2026 - age - (chance(0.3) ? 1 : 0)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
  };
  const sportsAt = (locationId: string) => [...new Set(courts.filter(c => c.locationId === locationId).map(c => c.sport))];

  function makeStudent(familyId: string, lastName: string, group: Group, locationId: string, fixed?: Partial<Student>): Student {
    let first = fixed?.firstName ?? firstName();
    while (usedNames.has(`${first} ${lastName}`)) first = firstName();
    usedNames.add(`${first} ${lastName}`);
    const available = sportsAt(locationId);
    const sport =
      fixed?.sport ??
      weighted<Sport>(
        (group === 'junior'
          ? ([['tennis', 72], ['padel', 28]] as Array<[Sport, number]>)
          : ([['tennis', 42], ['padel', 40], ['pickleball', 18]] as Array<[Sport, number]>)
        ).filter(([s]) => available.includes(s)),
      );
    const level = fixed?.level ?? weighted<Level>([[1, 38], [2, 32], [3, 20], [4, 10]]);
    sid++;
    return {
      id: `stu-${String(sid).padStart(3, '0')}`,
      familyId,
      firstName: first,
      lastName,
      birthDate: group === 'junior' ? birth(6, 17) : birth(19, 62),
      group,
      sport,
      level,
      status: 'active',
      availability: {weekdays: [], fromHour: 15, toHour: 22},
      frequency: fixed?.frequency ?? weighted<1 | 2 | 3>([[1, 20], [2, 65], [3, 15]]),
      homeLocationId: locationId,
      trialDate: addDays(SEASON_START, -int(3, 20)),
      phone: group === 'adult' ? phone() : null,
      email: group === 'adult' ? `${slug(first)}.${slug(lastName.split(' ')[0])}@correo.es` : null,
      notes: null,
      ...fixed,
    };
  }

  function makeFamily(kind: 'single' | 'couple' | 'kids' | 'parentAndKids', fixedFirst?: Partial<Student>) {
    const id = `fam-${String(families.length + 1).padStart(3, '0')}`;
    const s1 = pick(SURNAMES);
    let s2 = pick(SURNAMES);
    while (s2 === s1) s2 = pick(SURNAMES);
    const lastName = fixedFirst?.lastName ?? `${s1} ${s2}`;
    const locationId = fixedFirst?.homeLocationId ?? weighted([['loc-turia', 42], ['loc-malva', 31], ['loc-paterna', 27]]);
    const members: Student[] = [];
    let holderName = '';
    let holderStudentId: string | null = null;

    if (kind === 'single' || kind === 'couple' || kind === 'parentAndKids') {
      const adult = makeStudent(id, lastName, 'adult', locationId, fixedFirst);
      members.push(adult);
      holderName = `${adult.firstName} ${adult.lastName}`;
      holderStudentId = adult.id;
    }
    if (kind === 'couple') {
      let other = pick(SURNAMES);
      while (other === s1) other = pick(SURNAMES);
      members.push(makeStudent(id, `${other} ${pick(SURNAMES)}`, 'adult', locationId));
    }
    if (kind === 'kids' || kind === 'parentAndKids') {
      const kids = kind === 'kids' ? weighted([[1, 45], [2, 42], [3, 13]]) : weighted([[1, 60], [2, 40]]);
      for (let i = 0; i < kids; i++) members.push(makeStudent(id, lastName, 'junior', locationId));
      if (kind === 'kids') holderName = `${firstName()} ${lastName}`;
    }
    const holder = members.find(m => m.id === holderStudentId);
    families.push({
      id,
      name: `Familia ${lastName.split(' ')[0]}${kind === 'couple' ? ` · ${members[1].lastName.split(' ')[0]}` : ''}`,
      holderName,
      holderStudentId,
      phone: holder?.phone ?? phone(),
      email: holder?.email ?? `${slug(holderName.split(' ')[0])}.${slug(lastName.split(' ')[0])}@correo.es`,
    });
    students.push(...members);
  }

  // The example from the brief: Sarah, adult beginner, twice a week.
  makeFamily('single', {
    firstName: 'Sarah', lastName: 'Molina Ferrer', sport: 'tennis', level: 1, frequency: 2, homeLocationId: 'loc-turia',
  });
  while (students.length < 200) {
    makeFamily(weighted([['single', 30], ['couple', 12], ['kids', 36], ['parentAndKids', 22]]));
  }

  // ── Buckets: who can share a class ───────────────────────────────────────
  const bucketKey = (s: Student) => `${s.homeLocationId}|${s.sport}|${s.group}|${s.level}`;
  const buckets = new Map<string, Bucket>();
  const addToBucket = (s: Student) => {
    const key = bucketKey(s);
    if (!buckets.has(key)) {
      buckets.set(key, {key, locationId: s.homeLocationId, sport: s.sport, group: s.group, level: s.level as Level, students: []});
    }
    buckets.get(key)!.students.push(s);
  };
  students.forEach(addToBucket);
  // A lone student cannot form a group: move them to the sede with the biggest matching group.
  for (const b of [...buckets.values()]) {
    if (b.students.length >= 6) continue;
    const best = [...buckets.values()]
      .filter(o => o !== b && o.sport === b.sport && o.group === b.group && o.level === b.level)
      .sort((x, y) => y.students.length - x.students.length)[0];
    if (!best || b.students.some(s => s.id === 'stu-001')) continue;
    for (const s of b.students) {
      s.homeLocationId = best.locationId;
      best.students.push(s);
    }
    buckets.delete(b.key);
  }

  // ── Classes: pack each bucket into weekly tracks ─────────────────────────
  const classes: ClassTemplate[] = [];
  const enrollments: Enrollment[] = [];
  const courtBusy = new Set<string>();
  const coachBusy = new Set<string>();
  const coachLoad = new Map<string, number>();
  const seats = new Map<string, number>();
  const HOURS: Record<Group, number[]> = {junior: [17, 18, 16, 15, 19], adult: [20, 19, 21, 18, 17, 16]};
  const reserved = new Set<string>();
  let rotation = 0;
  /** Spread groups over the afternoon instead of piling them on one hour. */
  const hoursFor = (b: Bucket, fixed?: number) => {
    if (fixed) return [fixed];
    const base = HOURS[b.group];
    const head = base.slice(0, 3);
    const k = rotation++ % head.length;
    return [...head.slice(k), ...head.slice(0, k), ...base.slice(3)];
  };

  function freeCourt(b: Bucket, day: Weekday, hour: number): Court | undefined {
    return courts.find(c => c.locationId === b.locationId && c.sport === b.sport && !courtBusy.has(`${c.id}|${day}|${hour}`));
  }
  function freeCoach(b: Bucket, slots: Array<[Weekday, number]>): Coach | undefined {
    return coaches
      .filter(c => c.sports.includes(b.sport) && slots.every(([d, h]) => !coachBusy.has(`${c.id}|${d}|${h}`)))
      .sort((x, y) => {
        const home = Number(y.locationId === b.locationId) - Number(x.locationId === b.locationId);
        return home || (coachLoad.get(x.id) ?? 0) - (coachLoad.get(y.id) ?? 0);
      })[0];
  }
  function createClass(b: Bucket, day: Weekday, hour: number, coach: Coach): ClassTemplate | undefined {
    const court = freeCourt(b, day, hour);
    if (!court) return undefined;
    const c: ClassTemplate = {
      id: `cls-${String(classes.length + 1).padStart(3, '0')}`,
      locationId: b.locationId, courtId: court.id, coachId: coach.id,
      sport: b.sport, group: b.group, level: b.level, weekday: day, startHour: hour,
      capacity: defaultCapacity(b.sport, b.group),
    };
    classes.push(c);
    courtBusy.add(`${court.id}|${day}|${hour}`);
    coachBusy.add(`${coach.id}|${day}|${hour}`);
    coachLoad.set(coach.id, (coachLoad.get(coach.id) ?? 0) + 1);
    seats.set(c.id, 0);
    return c;
  }
  function openTrack(b: Bucket, days: Weekday[], fixedHour?: number): ClassTemplate[] | undefined {
    for (const hour of hoursFor(b, fixedHour)) {
      if (!days.every(d => freeCourt(b, d, hour))) continue;
      const coach = freeCoach(b, days.map(d => [d, hour] as [Weekday, number]));
      if (!coach) continue;
      return days.map(d => createClass(b, d, hour, coach)!);
    }
    return undefined;
  }
  function enroll(s: Student, c: ClassTemplate) {
    enrollments.push({id: `enr-${String(enrollments.length + 1).padStart(4, '0')}`, studentId: s.id, classId: c.id, from: SEASON_START, to: null});
    seats.set(c.id, (seats.get(c.id) ?? 0) + 1);
  }
  const classById0 = (id: string) => classes.find(c => c.id === id)!;
  const hasRoom = (c: ClassTemplate) => (seats.get(c.id) ?? 0) < c.capacity - (reserved.has(c.id) ? 1 : 0);

  const ordered = [...buckets.values()].sort((a, b) => {
    const sarah = (x: Bucket) => Number(x.students.some(s => s.firstName === 'Sarah' && s.lastName === 'Molina Ferrer'));
    return sarah(b) - sarah(a) || b.students.length - a.students.length;
  });

  for (const b of ordered) {
    const tracks: Record<string, ClassTemplate[][]> = {MW: [], TT: []};
    const fridays: ClassTemplate[] = [];
    const isSarahBucket = b.students.some(s => s.id === 'stu-001');
    if (isSarahBucket) {
      // Guarantees the brief's example: Tue + Thu 20:00 exists, and so does a Monday group.
      const tt = openTrack(b, [2, 4], 20);
      const mw = openTrack(b, [1, 3], 20);
      if (tt) tracks.TT.push(tt);
      if (mw) {
        tracks.MW.push(mw);
        reserved.add(mw[0].id); // keeps one Monday seat free for the voice example
      }
    }
    const joinTrack = (s: Student, prefer: 'MW' | 'TT'): boolean => {
      for (const kind of [prefer, prefer === 'MW' ? 'TT' : 'MW'] as const) {
        const open = tracks[kind].find(t => t.every(hasRoom));
        if (open) {
          open.forEach(c => enroll(s, c));
          return true;
        }
      }
      const created = openTrack(b, prefer === 'MW' ? [1, 3] : [2, 4]) ?? openTrack(b, prefer === 'MW' ? [2, 4] : [1, 3]);
      if (!created) return false;
      tracks[created[0].weekday === 1 ? 'MW' : 'TT'].push(created);
      created.forEach(c => enroll(s, c));
      return true;
    };
    const joinFriday = (s: Student): boolean => {
      let c = fridays.find(hasRoom);
      if (!c) {
        c = openTrack(b, [5])?.[0];
        if (c) fridays.push(c);
      }
      if (!c) return false;
      enroll(s, c);
      return true;
    };
    const joinSingle = (s: Student): boolean => {
      const all = [...tracks.MW.flat(), ...tracks.TT.flat(), ...fridays].filter(hasRoom);
      if (all.length) {
        enroll(s, all.sort((x, y) => (seats.get(y.id) ?? 0) - (seats.get(x.id) ?? 0))[0]);
        return true;
      }
      return joinFriday(s);
    };

    const sorted = [...b.students].sort((x, y) => Number(y.id === 'stu-001') - Number(x.id === 'stu-001') || y.frequency - x.frequency);
    for (const s of sorted) {
      const prefer = s.id === 'stu-001' ? 'TT' : chance(0.5) ? 'MW' : 'TT';
      if (s.frequency === 3) {
        joinTrack(s, prefer);
        const mine = new Set(enrollments.filter(e => e.studentId === s.id).map(e => classById0(e.classId).weekday));
        const third = [...tracks.MW.flat(), ...tracks.TT.flat()].find(c => hasRoom(c) && !mine.has(c.weekday));
        if (third) enroll(s, third);
        else joinFriday(s);
      } else if (s.frequency === 2) {
        joinTrack(s, prefer);
      } else {
        joinSingle(s);
      }
    }
  }

  // ── Availability that agrees with where each student ended up ────────────
  const classById = new Map(classes.map(c => [c.id, c]));
  for (const s of students) {
    const mine = enrollments.filter(e => e.studentId === s.id).map(e => classById.get(e.classId)!);
    const days = new Set<Weekday>(mine.map(c => c.weekday));
    const extra = int(0, 2);
    for (let i = 0; i < extra; i++) days.add(int(1, 5) as Weekday);
    const hours = mine.map(c => c.startHour);
    const base = s.group === 'junior' ? [16, 20] : [18, 22];
    const from = Math.max(15, Math.min(base[0], ...hours) - (chance(0.3) ? 1 : 0));
    const to = Math.min(22, Math.max(base[1], ...hours.map(h => h + 1)));
    s.availability = {weekdays: [...days].sort() as Weekday[], fromHour: from, toHour: to};
    if (s.id === 'stu-001') s.availability = {weekdays: [1, 2, 3, 4], fromHour: 19, toHour: 22};
    if (mine.length === 0) s.status = 'pending';
  }

  // ── Waiting list: assessed in a trial class, not yet placed ──────────────
  const candidates = students.filter(s => s.status === 'active' && s.id !== 'stu-001');
  const pendingIds = new Set<string>();
  while (pendingIds.size < 14) pendingIds.add(pick(candidates).id);
  const today = '2026-10-10';
  let n = 0;
  for (const s of students) {
    if (!pendingIds.has(s.id)) continue;
    for (let i = enrollments.length - 1; i >= 0; i--) if (enrollments[i].studentId === s.id) enrollments.splice(i, 1);
    s.status = 'pending';
    s.trialDate = addDays(today, -int(1, 9));
    const all: Weekday[] = [1, 2, 3, 4, 5];
    const extra = all.filter(d => !s.availability.weekdays.includes(d) && chance(0.5));
    s.availability = {...s.availability, weekdays: [...s.availability.weekdays, ...extra].sort() as Weekday[]};
    if (n === 3) s.availability = {weekdays: [5], fromHour: 15, toHour: 16}; // a hard case on purpose
    n++;
  }
  // Trial booked, level not assessed yet.
  const trials = candidates.filter(s => !pendingIds.has(s.id)).slice(-5);
  trials.forEach((s, i) => {
    for (let j = enrollments.length - 1; j >= 0; j--) if (enrollments[j].studentId === s.id) enrollments.splice(j, 1);
    s.status = 'trial';
    s.level = null;
    s.trialDate = addDays(mondayOf(today), 7 + (i % 5));
  });

  // ── A few open make-up credits ───────────────────────────────────────────
  const credits: MakeupCredit[] = [];
  const active = students.filter(s => s.status === 'active');
  for (let i = 0; i < 6; i++) {
    const s = active[(i * 31 + 7) % active.length];
    const e = enrollments.find(x => x.studentId === s.id)!;
    const c = classById.get(e.classId)!;
    credits.push({
      id: `mk-${i + 1}`,
      studentId: s.id,
      reason: i % 3 === 0 ? 'medical' : 'weather',
      originClassId: c.id,
      originDate: addDays(mondayOf('2026-09-28'), c.weekday - 1),
      status: 'open',
      bookedClassId: null,
      bookedDate: null,
    });
  }

  return {academy, locations, courts, coaches, families, students, classes, enrollments, overrides: [], absences: [], credits};
}
