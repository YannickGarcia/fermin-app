// Offline check of the Jev mapping: builds a request, then feeds a hand-made
// response (what Jev should answer for the brief's example) through the same
// resolver the rules use. It does not call the API.
import {buildDataset} from '../lib/data/seed';
import {buildIndex} from '../lib/data/store';
import {describeDraft, resolveSlots} from '../lib/voice/parse';
import {type JevResponse, buildJevRequest, shortlist, slotsFromJev} from '../lib/voice/jev';

const data = buildDataset();
const ix = buildIndex(data);
const people = data.students.map(s => ({id: s.id, name: `${s.firstName} ${s.lastName}`}));
const text = 'A Sara ponla lunes y jueves en vez de martes y jueves, a la misma hora';
const req = buildJevRequest(text, {students: people, coaches: data.coaches.map(c => ({id: c.id, name: `${c.firstName} ${c.lastName}`})), locations: data.locations.map(l => ({id: l.id, name: l.name})), todayName: 'sábado'});
console.log('questions', Object.keys(req.questions).length, '· student options', Object.keys((req.questions.student as {criteria: object}).criteria).length, '· shortlist', shortlist(text, people).map(p => p.name).join(', '));

const ch = (choice: string, confidence = 0.95) => ({type: 'choice' as const, choice, confidence, probabilities: {[choice]: confidence}});
const n = (noul: number) => ({type: 'noul' as const, noul});
const fake: JevResponse = {
  model: 'jev-test',
  answers: {
    intent: ch('move'), student: ch('stu-001'), coach: ch('none'), day: ch('none'), hour: ch('same'), location: ch('none'), scope: ch('session', 0.7),
    from_1: n(0.03), from_2: n(0.97), from_3: n(0.02), from_4: n(0.9), from_5: n(0.01),
    to_1: n(0.96), to_2: n(0.04), to_3: n(0.02), to_4: n(0.95), to_5: n(0.5),
  },
};
const slots = slotsFromJev(fake);
const draft = resolveSlots(slots, {data, ix, weekMonday: '2026-10-12', today: '2026-10-10'});
console.log(draft.kind, '·', describeDraft(draft, ix), '· doubts:', slots.doubts);
if (draft.kind !== 'move' || draft.changes.length !== 1 || slots.doubts.length !== 1) throw new Error('Jev mapping check failed');
