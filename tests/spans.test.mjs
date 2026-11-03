import test from 'node:test';
import assert from 'node:assert/strict';
import { boardSpan, entryEnd, stackEntries } from '../model.ts';
import { noteAppearances } from '../schedule-model.ts';

const note = (path, start, end = start, body = '') => ({ path, title: path, date: start, body, thread: 'Proyecto.md', next: [], occurrence: { kind: 'single', sourceDate: start, end, warnings: [], limited: false } });
function noCollisions(stack, gap) {
  for (const [i, a] of stack.entries()) for (const b of stack.slice(i + 1)) {
    if (a.entry.date <= entryEnd(b.entry) && b.entry.date <= entryEnd(a.entry)) {
      assert.ok(a.top + a.height + gap <= b.top || b.top + b.height + gap <= a.top, `${a.entry.path} overlaps ${b.entry.path}`);
    }
  }
}

test('inclusive end dates occupy two columns, with one card and no changed source date', () => {
  const entry = note('Publicación', '2026-11-03', '2026-11-04');
  assert.deepEqual(boardSpan(entry, '2026-11-01', '2026-11-30'), { start: '2026-11-03', end: '2026-11-04', days: 2, continuesBefore: false, continuesAfter: false });
  assert.equal(entry.date, '2026-11-03');
});

test('overlapping spans stack across their entire inclusive duration and reuse free space', () => {
  const input = [note('a', '2026-11-02', '2026-11-04'), note('b', '2026-11-03', '2026-11-03', 'Texto'), note('c', '2026-11-04', '2026-11-06'), note('d', '2026-11-05')];
  const stack = stackEntries(input);
  assert.deepEqual(stack.map(e => [e.entry.path, e.top]), [['a', 0], ['b', 84], ['c', 84], ['d', 0]]);
  noCollisions(stack, 16);
});

test('Base order and folded cards preserve gap-free interval packing without overlaps', () => {
  const input = [note('late', '2026-11-04'), note('long', '2026-11-02', '2026-11-05', 'Texto'), note('early', '2026-11-02'), note('after', '2026-11-06')];
  for (const compact of [false, true]) {
    const stack = stackEntries(input, compact, true);
    assert.deepEqual(stack.map(e => e.entry.path), input.map(e => e.path));
    noCollisions(stack, compact ? 4 : 16);
    assert.equal(stack.at(-1).top, 0);
    if (compact) assert.ok(stack.every(e => e.height === 24));
  }
});

test('board edges clip the drawing while preserving the real start and end dates', () => {
  const entry = note('Curso', '2026-10-25', '2026-12-10');
  assert.deepEqual(boardSpan(entry, '2026-11-01', '2026-11-30'), { start: '2026-11-01', end: '2026-11-30', days: 30, continuesBefore: true, continuesAfter: true });
  assert.equal(boardSpan(entry, '2027-01-01', '2027-01-31'), null);
  assert.equal(boardSpan(entry, '2026-01-01', '2026-01-31'), null);
});

test('missing, reversed or invalid end dates retain the ordinary single-day geometry', () => {
  for (const end of [undefined, '2026-11-02', 'bad', '2026-02-30']) {
    const entry = note('Nota', '2026-11-03', end);
    assert.equal(entryEnd(entry), entry.date);
    assert.equal(boardSpan(entry, '2026-11-01', '2026-11-30').days, 1);
  }
});

test('a note starting before the loaded window remains visible until its inclusive end', () => {
  const entry = note('Viaje', '2026-10-30');
  const schedule = { start: entry.date, end: '2026-11-04', repeat: '' };
  const result = noteAppearances(entry, schedule, '2026-11-03', '2026-11-30');
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].date, entry.date);
  assert.equal(boardSpan(result.entries[0], '2026-11-03', '2026-11-30').days, 2);
});

test('repeated durations include an ongoing occurrence and stack independently', () => {
  const entry = note('Taller semanal', '2026-11-02');
  const result = noteAppearances(entry, { start: entry.date, end: '2026-11-04', repeat: 'weekly' }, '2026-11-03', '2026-11-11');
  assert.deepEqual(result.entries.map(e => [e.date, e.occurrence.end]), [['2026-11-02', '2026-11-04'], ['2026-11-09', '2026-11-11']]);
  noCollisions(stackEntries(result.entries), 16);
});

test('Notebook preserves the duration of ordinary historical notes outside its scheduling window', () => {
  const entry = note('Curso pasado', '2026-10-30');
  const result = noteAppearances(entry, { start: entry.date, end: '2026-11-04', repeat: '' }, '2027-01-01', '2027-01-31', true);
  assert.equal(result.entries.length, 1);
  assert.equal(entryEnd(result.entries[0]), '2026-11-04');
});
