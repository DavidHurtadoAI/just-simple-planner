import test from 'node:test';
import assert from 'node:assert/strict';
import { dateList, projectSchedule, repeatRule, repeatSpans } from '../schedule.ts';
import { noteAppearances } from '../schedule-model.ts';

const note = { path: 'Reunión.md', title: 'Reunión', date: '2026-11-02', thread: 'Proyecto.md', next: ['Enviar.md'], body: '- [ ] Revisar', snapshot: 'Original Markdown' };
const weekly = { start: '2026-11-02T18:00:00+01:00', end: null, repeat: 'weekly' };
const dates = result => result.entries.map(entry => entry.date);

test('a weekly property projects Mondays even when the main date is outside the window', () => {
  const result = noteAppearances(note, weekly, '2026-11-08', '2026-11-30');
  assert.deepEqual(dates(result), ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.deepEqual(result.warnings, []);
});

test('repeated appearances keep one file, one graph node and the original editing snapshot', () => {
  const before = structuredClone(note);
  const result = noteAppearances(note, weekly, '2026-11-01', '2026-11-30');
  assert.equal(new Set(result.entries.map(e => e.path)).size, 1);
  assert.ok(result.entries.every(e => e.snapshot === note.snapshot && e.body === note.body && e.next === note.next && e.occurrence.sourceDate === note.date));
  assert.deepEqual(note, before);
});

test('repeat until is inclusive and skipped dates omit occurrences by their start', () => {
  assert.deepEqual(dates(noteAppearances(note, { ...weekly, until: '2026-11-23', except: ['2026-11-16'] }, '2026-11-01', '2026-12-31')), ['2026-11-02', '2026-11-09', '2026-11-23']);
});

test('monthly and yearly schedules keep their original month-end and leap-year anchors', () => {
  assert.deepEqual(projectSchedule('2026-01-31', null, 'monthly', '2026-01-01', '2026-04-30').spans.map(s => s.start), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(projectSchedule('2024-02-29', null, 'yearly', '2025-01-01', '2028-12-31').spans.map(s => s.start), ['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
});

test('malformed repeat rules and limits show the source once with an explanation', () => {
  for (const changes of [{ repeat: 'tomorrow' }, { until: 'bad' }, { until: '2026-11-01' }, { except: ['bad'] }, { except: Array(129).fill('2026-11-09') }]) {
    const result = noteAppearances(note, { ...weekly, ...changes }, '2026-11-01', '2026-11-30');
    assert.deepEqual(dates(result), [note.date]);
    assert.ok(result.warnings.length);
  }
});

test('finished and fully excluded schedules do not produce phantom cards', () => {
  assert.deepEqual(dates(noteAppearances(note, { ...weekly, until: '2026-11-09' }, '2026-12-01', '2026-12-31')), []);
  assert.deepEqual(dates(noteAppearances(note, { ...weekly, except: ['2026-11-02'] }, '2026-11-02', '2026-11-02')), []);
});

test('additional days are sorted, deduplicated and all open the same note', () => {
  const result = noteAppearances(note, { ...weekly, repeat: '', additional: ['2026-11-09', '2026-11-02', '2026-11-09', '2026-11-20'] }, '2026-11-01', '2026-11-30');
  assert.deepEqual(dates(result), ['2026-11-02', '2026-11-09', '2026-11-20']);
  assert.ok(result.entries.every(e => e.occurrence.kind === 'additional' && e.path === note.path));
});

test('additional days do not extend multi-day or repeating schedules', () => {
  for (const schedule of [{ ...weekly }, { ...weekly, repeat: '', end: '2026-11-04' }]) {
    const before = noteAppearances(note, schedule, '2026-11-01', '2026-11-30');
    const after = noteAppearances(note, { ...schedule, additional: ['2026-11-07'] }, '2026-11-01', '2026-11-30');
    assert.deepEqual(dates(after), dates(before));
    assert.ok(after.warnings.some(w => w.includes('single-day')));
  }
});

test('multi-day repeated cards preserve the duration in each appearance', () => {
  const result = noteAppearances(note, { ...weekly, end: '2026-11-04T20:00:00+01:00' }, '2026-11-01', '2026-11-20');
  assert.deepEqual(result.entries.map(e => [e.date, e.occurrence.end]), [['2026-11-02', '2026-11-04'], ['2026-11-09', '2026-11-11'], ['2026-11-16', '2026-11-18']]);
});

test('very long overlapping series remain bounded and each returned span intersects the board', () => {
  const result = noteAppearances(note, { start: '2000-01-01', end: '2100-01-01', repeat: 'daily' }, '2026-11-01', '2026-11-30');
  assert.equal(result.entries.length, 500);
  assert.equal(result.limited, true);
  assert.ok(result.entries.every(e => e.date <= '2026-11-30' && e.occurrence.end >= '2026-11-01'));
});

test('Notebook preserves ordinary historical entries while bounding scheduled appearances', () => {
  assert.deepEqual(dates(noteAppearances(note, { ...weekly, repeat: '' }, '2027-01-01', '2027-01-31', true)), [note.date]);
  assert.deepEqual(dates(noteAppearances(note, weekly, '2027-01-01', '2027-01-31', true)), ['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25']);
});

test('the rule grammar matches Calendar and date lists reject ambiguous values', () => {
  for (const rule of ['weekly', 'every week', 'every second week', 'w2', 'monthly', 'm3', 'yearly', 'd']) assert.ok(repeatRule(rule));
  for (const rule of ['w0', 'w1.5', 'every 0 days', 'tomorrow']) assert.equal(repeatRule(rule), null);
  assert.equal(dateList(['02/11/2026', '2026-02-30', '2026-11-09T10:00', 3]).invalid, 4);
  assert.equal(dateList(Array(129).fill('2026-11-09')).limited, true);
  assert.equal(repeatSpans({ start: '2000-01-01', end: '2000-01-01' }, { unit: 'day', interval: 1 }, '2026-01-01', '2030-01-01').spans.length, 500);
});
