import test from 'node:test';
import assert from 'node:assert/strict';
import { validDay, shiftDay, dayNumber, wikiTarget, connected, spotlight, stackEntries, dateMoves, toggleTask, tasks, History, applyChanges } from '../model.ts';

const entry = (path, next = [], date = '2026-10-30') => ({ path, next, date, title: path, thread: 'Proyecto.md', body: '' });
const map = (...entries) => new Map(entries.map(e => [e.path, e]));
function store(initial) {
  const files = new Map(Object.entries(initial));
  return { files, async write(path, expected, replacement) {
    if (files.get(path) !== expected) throw Error(`Conflict: ${path}`);
    files.set(path, replacement);
  } };
}

test('calendar dates reject normalized invalid dates and datetimes', () => {
  for (const value of ['2026-02-29', '2026-13-01', '2026-04-31', '2026-1-01', '2026-10-30T10:00', '', 42, null]) assert.equal(validDay(value), false);
  assert.equal(validDay('2028-02-29'), true);
});
test('calendar arithmetic crosses leap years, year boundaries and DST dates', () => {
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2026-03-28', 2), '2026-03-30');
  assert.equal(shiftDay('2026-10-26', -2), '2026-10-24');
  assert.equal(dayNumber('2026-10-26') - dayNumber('2026-10-24'), 2);
  assert.throws(() => shiftDay('2026-10-30', .5));
});
test('wikilinks support full paths, aliases and headings', () => {
  assert.equal(wikiTarget('[[Carpeta/Nota|Nombre]]'), 'Carpeta/Nota');
  assert.equal(wikiTarget('[[Nota#Sección]]'), 'Nota');
  assert.equal(wikiTarget('Nota'), null);
});
test('connected flow includes branches and terminates on cycles or dangling links', () => {
  const entries = map(entry('a', ['b', 'c']), entry('b', ['d']), entry('c', ['missing']), entry('d', ['a']));
  assert.deepEqual([...connected(entries, ['a'])].sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual([...connected(entries, ['missing'])], []);
});
test('spotlight includes ancestors without their earlier parallel branches', () => {
  const entries = map(entry('a', ['b', 'parallel']), entry('b', ['c']), entry('c'), entry('parallel'));
  assert.deepEqual([...spotlight(entries, 'b')].sort(), ['a', 'b', 'c']);
});
test('flow rescheduling preserves day gaps without changing the originals', () => {
  const entries = map(entry('a', ['b'], '2026-10-30'), entry('b', [], '2026-11-04'));
  assert.deepEqual([...dateMoves(entries, ['a', 'b'], 3)], [['a', '2026-11-02'], ['b', '2026-11-07']]);
  assert.equal(entries.get('a').date, '2026-10-30');
});
test('same-day entries stack deterministically, independent of input order', () => {
  const result = stackEntries([entry('b'), entry('c', [], '2026-11-01'), entry('a')]);
  assert.deepEqual(result.map(({ entry, slot }) => [entry.path, slot]), [['a', 0], ['b', 1], ['c', 0]]);
});
test('task indexing ignores fenced examples and recognizes numbered tasks', () => {
  const body = '- [ ] Pendiente\n```md\n- [ ] Ejemplo\n```\n1. [X] Hecho\n~~~\n- [ ] Otro ejemplo\n~~~';
  assert.deepEqual(tasks(body), [{ line: 0, text: 'Pendiente', checked: false }, { line: 4, text: 'Hecho', checked: true }]);
});
test('task completion preserves CRLF, indentation and other tasks', () => {
  const body = 'Texto\r\n  - [ ] Primera\r\n- [ ] Segunda\r\n';
  assert.equal(toggleTask(body, 1, true), 'Texto\r\n  - [x] Primera\r\n- [ ] Segunda\r\n');
  assert.throws(() => toggleTask(body, 0, true));
});
test('batch failure rolls earlier files back', async () => {
  const disk = store({ a: 'old-a', b: 'external-edit' });
  await assert.rejects(applyChanges(disk, [{ path: 'a', before: 'old-a', after: 'new-a' }, { path: 'b', before: 'old-b', after: 'new-b' }]), /rolled back/);
  assert.equal(disk.files.get('a'), 'old-a');
  assert.equal(disk.files.get('b'), 'external-edit');
});
test('rollback reports concurrent changes and never overwrites them', async () => {
  const disk = store({ a: 'old-a', b: 'old-b' });
  const write = disk.write.bind(disk);
  disk.write = async (path, expected, replacement) => {
    if (path === 'b') { disk.files.set('a', 'concurrent-a'); throw Error('Disk failure'); }
    await write(path, expected, replacement);
  };
  await assert.rejects(applyChanges(disk, [{ path: 'a', before: 'old-a', after: 'new-a' }, { path: 'b', before: 'old-b', after: 'new-b' }]), /Rollback needs review: a/);
  assert.equal(disk.files.get('a'), 'concurrent-a');
});
test('undo and redo treat a multi-note move as one operation', async () => {
  const disk = store({ a: 'old-a', b: 'old-b' });
  const history = new History(disk);
  await history.commit([{ path: 'a', before: 'old-a', after: 'new-a' }, { path: 'b', before: 'old-b', after: 'new-b' }]);
  assert.equal(history.canUndo, true);
  await history.undo();
  assert.deepEqual([...disk.files.values()], ['old-a', 'old-b']);
  await history.redo();
  assert.deepEqual([...disk.files.values()], ['new-a', 'new-b']);
});
test('undo refuses to overwrite a subsequent external edit and remains available', async () => {
  const disk = store({ a: 'before' });
  const history = new History(disk);
  await history.commit([{ path: 'a', before: 'before', after: 'after' }]);
  disk.files.set('a', 'external');
  await assert.rejects(history.undo(), /Conflict/);
  assert.equal(disk.files.get('a'), 'external');
  assert.equal(history.canUndo, true);
});
test('new operations clear redo, and no-ops do not create history', async () => {
  const disk = store({ a: 'a' }); const history = new History(disk);
  await history.commit([{ path: 'a', before: 'a', after: 'a' }]);
  assert.equal(history.canUndo, false);
  await history.commit([{ path: 'a', before: 'a', after: 'b' }]); await history.undo();
  await history.commit([{ path: 'a', before: 'a', after: 'c' }]);
  assert.equal(history.canRedo, false);
});
