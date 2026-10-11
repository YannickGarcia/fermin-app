// Make-up cap and mixed-level moves.
import {buildIndex, cancelForRain, getData, updateAcademy, undo} from '../lib/data/store';
import {parseCommand} from '../lib/voice/parse';

const week = '2026-10-12';
let d = getData();
const cls = d.classes.find(c => c.weekday === 4 && d.enrollments.filter(e => e.classId === c.id).length >= 3)!;
const unlimited = cancelForRain([{classId: cls.id, date: '2026-10-15'}]);
undo();
updateAcademy({makeupCapPerSeason: 1});
const firstAtCap = cancelForRain([{classId: cls.id, date: '2026-10-15'}]);
const second = cancelForRain([{classId: cls.id, date: '2026-10-22'}]);
console.log('credits: no cap', unlimited, '· cap 1, first cancel', firstAtCap, '· second cancel', second);
if (unlimited < 3 || second !== 0) throw new Error('cap check failed');

// A student whose level has no group on some day but the adjacent level has a small one.
d = getData();
const ix = buildIndex(d);
const size = (id: string) => (ix.enrollmentsByClass.get(id) ?? []).length;
let found = '';
outer: for (const s of d.students.filter(x => x.status === 'active' && x.level)) {
  const mine = (ix.enrollmentsByStudent.get(s.id) ?? []).map(e => ix.cls.get(e.classId)!);
  for (const from of mine) for (const day of [1, 2, 3, 4, 5]) {
    if (mine.some(c => c.weekday === day)) continue;
    const same = d.classes.some(c => c.weekday === day && c.startHour === from.startHour && c.sport === from.sport && c.group === from.group && c.level === from.level && size(c.id) < c.capacity);
    const adj = d.classes.find(c => c.weekday === day && c.startHour === from.startHour && c.sport === from.sport && c.group === from.group && Math.abs(c.level - from.level) === 1 && size(c.id) <= 2);
    if (!same && adj && d.students.filter(x => x.firstName === s.firstName).length === 1) {
      const names = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
      const text = `cambia a ${s.firstName} de ${names[from.weekday]} a ${names[day]}, misma hora`;
      const draft = parseCommand(text, {data: d, ix, weekMonday: week, today: '2026-10-10'});
      found = `${text} → ${draft.kind} ${draft.kind === 'move' ? `level ${s.level} into level ${draft.changes[0]?.to.level}, issues ${draft.issues.length}` : ''}`;
      if (draft.kind !== 'move' || draft.changes[0]?.to.level === s.level || draft.issues.length) throw new Error('mixed move failed: ' + found);
      break outer;
    }
  }
}
console.log('mixed move:', found || 'no such case in the seed');
