import {buildDataset} from '../lib/data/seed';
import {buildIndex} from '../lib/data/store';
import {parseCommand, describeDraft} from '../lib/voice/parse';
import {proposeFor} from '../lib/scheduling/allocate';
const data = buildDataset(); const ix = buildIndex(data);
const ctx = {data, ix, weekMonday: '2026-10-12', today: '2026-10-10'};
for (const t of ['Change Sarah from Tuesday and Thursdays to Mondays and Thurdays, same time', 'Cambia a Sarah de martes y jueves a lunes y jueves, misma hora', 'Pasa a Sarah Molina de los jueves a los miércoles a las 19', 'cancela por lluvia el jueves en Malvarrosa', 'pon a Nacho en la clase de Sarah del martes', 'busca a Hugo', 'Sarah']) {
  const d = parseCommand(t, ctx);
  console.log('>', t, '\n ', d.kind, describeDraft(d, ix), 'issues' in d ? d.issues : '', d.kind === 'ambiguous' ? d.options.length : '');
}
for (const s of data.students.filter(s => s.status === 'pending')) {
  const r = proposeFor(data, ix, s, '2026-10-12');
  console.log(s.firstName, s.sport, s.group, s.level, 'f' + s.frequency, JSON.stringify(s.availability), '→', r.proposals.map(p => `${p.classes.map(c => c.weekday + '@' + c.startHour).join('+')}(${p.score}${p.partial ? ',partial' : ''})`).join(' | ') || 'NONE', r.blockers, r.newClassSlots.length);
}
