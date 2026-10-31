import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, cloneSettings, cleanFolder, validateSettings, pathInScope, folderIntersectsScope, readEntryProperties, mapEntryFields, changesIndex } from '../settings.ts';
import { History } from '../model.ts';

test('English defaults preserve the existing schema and use the entire vault', () => {
  const defaults = defaultSettings();
  assert.equal(defaults.entryFolder, 'Planner/Entries');
  assert.equal(defaults.threadFolder, 'Planner/Threads');
  assert.equal(defaults.searchEntireVault, true);
  assert.deepEqual(defaults.propertyNames, { date: 'date', title: 'title', thread: 'thread', next: 'next' });
  defaults.propertyNames.date = 'fecha';
  assert.equal(defaultSettings().propertyNames.date, 'date');
});

test('legacy saved folders and zoom survive without adding a restriction or changing schema', () => {
  const saved = { entryFolder: 'Notas/Entradas', threadFolder: '', dayWidth: 140 };
  const copy = structuredClone(saved);
  const loaded = loadSettings(saved);
  assert.equal(loaded.entryFolder, saved.entryFolder);
  assert.equal(loaded.threadFolder, '');
  assert.equal(loaded.dayWidth, 140);
  assert.equal(loaded.searchEntireVault, true);
  assert.equal(loaded.propertyNames.next, 'next');
  assert.deepEqual(saved, copy);
  assert.deepEqual(loadSettings(null), defaultSettings());
});

test('folder validation normalizes vault-relative paths and rejects absolute paths and traversal', () => {
  assert.equal(cleanFolder(' Projects\\Work//Sub/ '), 'Projects/Work/Sub');
  assert.equal(cleanFolder(''), '');
  for (const path of ['/outside', 'C:\\outside', '\\\\server\\share', '../outside', 'Folder/../Outside', './Folder']) assert.throws(() => cleanFolder(path));
  const scoped = { ...defaultSettings(), searchEntireVault: false };
  assert.throws(() => validateSettings(scoped), /Search folder/);
});

test('scoped paths include descendants and exclude same-prefix siblings and unrelated folders', () => {
  const settings = { ...defaultSettings(), searchEntireVault: false, searchFolder: 'Projects/Work' };
  assert.equal(pathInScope('Projects/Work/Entrada.md', settings), true);
  assert.equal(pathInScope('Projects/Work/Sub/Entrada.md', settings), true);
  for (const path of ['Projects/Work2/Entrada.md', 'Projects/Personal/Entrada.md', 'Entrada.md']) assert.equal(pathInScope(path, settings), false);
  assert.equal(folderIntersectsScope('Projects', settings), true);
  assert.equal(folderIntersectsScope('Projects/Work/Sub', settings), true);
  assert.equal(folderIntersectsScope('Projects/Work2', settings), false);
  assert.equal(pathInScope('Anywhere/Entry.md', { ...settings, searchEntireVault: true }), true);
  assert.equal(pathInScope('Entry.md', { ...settings, searchFolder: '' }), false);
});

test('creation folders never determine the search scope', () => {
  const settings = { ...defaultSettings(), entryFolder: 'Somewhere', threadFolder: '', searchEntireVault: false, searchFolder: 'Projects' };
  assert.equal(pathInScope('Projects/Entry.md', settings), true);
  assert.equal(pathInScope('Somewhere/Entry.md', settings), false);
  assert.equal(pathInScope('Root.md', settings), false);
});

test('property mapping validates duplicates, reserved names and blank names before saving', () => {
  for (const value of ['', ' ', 'planner_type', '__proto__', 'constructor', 'prototype', 'bad\nname']) {
    const settings = defaultSettings(); settings.propertyNames.date = value;
    assert.throws(() => validateSettings(settings));
  }
  const duplicate = defaultSettings(); duplicate.propertyNames.title = 'DATE';
  assert.throws(() => validateSettings(duplicate), /different/);
  const custom = defaultSettings(); custom.propertyNames = { date: ' fecha ', title: 'Mi título', thread: 'project', next: 'following' };
  assert.equal(validateSettings(custom).propertyNames.date, 'fecha');
  assert.equal(custom.propertyNames.date, ' fecha ');
});

test('custom mappings read exact keys, keep missing titles optional, and do not migrate frontmatter', () => {
  const fm = { planner_type: 'entry', fecha: '2026-10-31', project: '[[Curso]]', following: ['[[Siguiente]]'], date: '1999-01-01' };
  const before = structuredClone(fm);
  const props = readEntryProperties(fm, { date: 'fecha', title: 'nombre', thread: 'project', next: 'following' });
  assert.equal(props.date, '2026-10-31'); assert.equal(props.title, undefined);
  assert.equal(props.thread, '[[Curso]]'); assert.deepEqual(props.next, ['[[Siguiente]]']);
  assert.deepEqual(fm, before);
});

test('mapped edits support swapped names and preserve unrelated marker fields', () => {
  const names = { date: 'title', title: 'date', thread: 'project', next: 'links' };
  const result = mapEntryFields({ date: '2026-10-31', title: 'Resumen', thread: '[[Proyecto]]', next: [], planner_type: 'entry' }, names);
  assert.deepEqual(result, { title: '2026-10-31', date: 'Resumen', project: '[[Proyecto]]', links: [], planner_type: 'entry' });
  assert.throws(() => mapEntryFields({ date: 'one', when: 'two' }, { ...names, date: 'when' }), /same property/);
  assert.throws(() => mapEntryFields({ date: 'value' }, { ...names, date: '__proto__' }), /reserved/);
});

test('only scope and property changes require index and undo reset', () => {
  const current = defaultSettings(); const draft = cloneSettings(current);
  draft.entryFolder = 'Other'; draft.dayWidth = 250;
  assert.equal(changesIndex(current, draft), false);
  draft.propertyNames.next = 'following';
  assert.equal(changesIndex(current, draft), true);
  assert.equal(current.propertyNames.next, 'next');
  assert.equal(changesIndex(current, { ...current, searchEntireVault: false }), true);
});

test('clearing history cannot write files and drops both undo and redo', async () => {
  let text = 'before'; const history = new History({ async write(path, expected, next) { assert.equal(text, expected); text = next; } });
  await history.commit([{ path: 'Entry.md', before: 'before', after: 'after' }]);
  await history.undo(); assert.equal(history.canRedo, true);
  history.clear(); assert.equal(history.canUndo, false); assert.equal(history.canRedo, false); assert.equal(text, 'before');
  history.busy = true; assert.throws(() => history.clear(), /finish/);
});
