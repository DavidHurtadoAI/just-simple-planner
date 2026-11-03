import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationDocument, movedNoteDates, noteDay, plannerSignature, BASES_VIEW_TYPE } from '../base-model.ts';
import { defaultSettings } from '../settings.ts';

const entry = (path, next = []) => ({ path, title: path, date: '2026-11-02', thread: 'Hilo.md', next, body: 'No copiar este cuerpo a la Base.' });
const thread = { path: 'Hilo.md', title: 'Hilo', status: 'active', color: 'pink', order: 0 };

test('Bases cards use the written day of dates and datetimes without timezone conversion', () => {
  for (const value of ['2026-11-02', '2026-11-02T23:45:00-08:00', '2026-11-02 18:00']) assert.equal(noteDay(value), '2026-11-02');
  for (const value of ['2026-02-30', '2026-11-02T25:00', '2026-11-02junk', ['2026-11-02'], null]) assert.equal(noteDay(value), null);
});

test('moving a note preserves its written time, offset and inclusive duration', () => {
  assert.deepEqual(movedNoteDates('2026-11-02T18:00:00+01:00', '2026-11-04T20:00:00+01:00', '2026-11-09'), { start: '2026-11-09T18:00:00+01:00', end: '2026-11-11T20:00:00+01:00' });
  assert.deepEqual(movedNoteDates('2028-02-28', '2028-03-01', '2028-12-30'), { start: '2028-12-30', end: '2029-01-01' });
  assert.deepEqual(movedNoteDates('2026-11-02 18:00', undefined, '2026-11-09'), { start: '2026-11-09 18:00' });
});

test('invalid dates and ranges cannot be silently replaced during a move', () => {
  for (const args of [['bad', null, '2026-11-02'], ['2026-11-02', '2026-11-01', '2026-11-09'], ['2026-11-02', 'bad', '2026-11-09'], ['2026-11-02', null, '2026-02-30']]) assert.throws(() => movedNoteDates(...args));
});

test('migration creates a view configuration while preserving inputs and empty threads', () => {
  const settings = defaultSettings(); settings.propertyNames = { date: 'fecha', title: 'titulo', thread: 'proyecto', next: 'siguiente' };
  settings.entryFolder = 'Carpeta histórica';
  const rows = [thread, { ...thread, path: 'Hilo vacío.md', title: 'Hilo vacío' }];
  const cards = [entry('Una.md', ['Otra.md'])];
  const before = structuredClone({ settings, cards, rows });
  const document = migrationDocument(settings, cards, rows, ['Inválida.md'], { collapsed: ['Hilo.md'] });
  assert.deepEqual({ settings, cards, rows }, before);
  assert.deepEqual(document.filters, { or: ['note.planner_type == "entry"', 'note.planner_type == "thread"'] });
  const view = document.views[0];
  assert.equal(view.type, BASES_VIEW_TYPE);
  assert.equal(view.dateProperty, 'note.fecha');
  assert.equal(view.nextProperty, 'note.siguiente');
  assert.deepEqual(view.threadNotes, ['Hilo.md', 'Hilo vacío.md']);
  assert.deepEqual(view.migration.invalid, ['Inválida.md']);
  assert.ok(!JSON.stringify(document).includes(cards[0].body));
  assert.ok(!JSON.stringify(document.filters).includes(settings.entryFolder));
});

test('migration signature is independent of enumeration and connection ordering', () => {
  assert.equal(plannerSignature([entry('B.md'), entry('A.md', ['B.md', 'C.md'])], [thread]), plannerSignature([entry('A.md', ['C.md', 'B.md']), entry('B.md')], [thread]));
});

test('migration detects changed dates, missing connections and altered thread metadata', () => {
  const cards = [entry('A.md', ['B.md'])]; const baseline = plannerSignature(cards, [thread]);
  for (const changed of [{ ...cards[0], date: '2026-11-03' }, { ...cards[0], next: [] }, { ...cards[0], title: 'Otro título' }]) assert.notEqual(plannerSignature([changed], [thread]), baseline);
  assert.notEqual(plannerSignature(cards, [{ ...thread, color: 'blue' }]), baseline);
  assert.notEqual(plannerSignature([], [thread]), baseline);
});
