import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, cloneSettings, cleanFolder, validateSettings, pathInScope, folderIntersectsScope, readEntryProperties, mapEntryFields, changesIndex, creationFolder, legacyDestinationsChanged } from '../settings.ts';
import { History, isEntryFrontmatter, isPlannerFrontmatter } from '../model.ts';

test('English defaults use one Planner base and relative creation folders', () => {
  const defaults = defaultSettings();
  assert.equal(defaults.plannerFolder, 'Planner');
  assert.equal(defaults.entryFolder, 'Entries');
  assert.equal(defaults.threadFolder, 'Threads');
  assert.equal('showAllDatedNotes' in defaults, false);
  assert.equal(creationFolder(defaults, 'entry'), 'Planner/Entries');
  assert.equal(creationFolder(defaults, 'thread'), 'Planner/Threads');
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
  assert.equal(loaded.plannerFolder, '');
  assert.equal(creationFolder(loaded, 'entry'), 'Notas/Entradas');
  assert.equal(loaded.propertyNames.next, 'next');
  assert.deepEqual(saved, copy);
  assert.deepEqual(loadSettings(null), defaultSettings());
});

test('folder validation normalizes vault-relative paths and rejects absolute paths and traversal', () => {
  assert.equal(cleanFolder(' Projects\\Work//Sub/ '), 'Projects/Work/Sub');
  assert.equal(cleanFolder(''), '');
  for (const path of ['/outside', 'C:\\outside', '\\\\server\\share', '../outside', 'Folder/../Outside', './Folder']) assert.throws(() => cleanFolder(path));
  for (const key of ['plannerFolder', 'entryFolder', 'threadFolder']) assert.throws(() => validateSettings({ ...defaultSettings(), [key]: '../outside' }));
});

test('scoped paths include descendants and exclude same-prefix siblings and unrelated folders', () => {
  const settings = { ...defaultSettings(), plannerFolder: 'Projects/Work' };
  assert.equal(pathInScope('Projects/Work/Entrada.md', settings), true);
  assert.equal(pathInScope('Projects/Work/Sub/Entrada.md', settings), true);
  for (const path of ['Projects/Work2/Entrada.md', 'Projects/Personal/Entrada.md', 'Entrada.md']) assert.equal(pathInScope(path, settings), false);
  assert.equal(folderIntersectsScope('Projects', settings), true);
  assert.equal(folderIntersectsScope('Projects/Work/Sub', settings), true);
  assert.equal(folderIntersectsScope('Projects/Work2', settings), false);
  assert.equal(pathInScope('Anywhere/Entry.md', { ...settings, plannerFolder: '' }), true);
  assert.equal(pathInScope('Entry.md', { ...settings, plannerFolder: '' }), true);
});

test('creation folders never determine the search scope', () => {
  const settings = { ...defaultSettings(), entryFolder: 'Somewhere', threadFolder: '', plannerFolder: 'Projects' };
  assert.equal(pathInScope('Projects/Entry.md', settings), true);
  assert.equal(pathInScope('Somewhere/Entry.md', settings), false);
  assert.equal(pathInScope('Root.md', settings), false);
  assert.equal(creationFolder(settings, 'entry'), 'Projects/Somewhere');
  assert.equal(creationFolder(settings, 'thread'), 'Projects');
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
  assert.equal(changesIndex(current, { ...current, plannerFolder: '' }), true);
});

test('clearing history cannot write files and drops both undo and redo', async () => {
  let text = 'before'; const history = new History({ async write(path, expected, next) { assert.equal(text, expected); text = next; } });
  await history.commit([{ path: 'Entry.md', before: 'before', after: 'after' }]);
  await history.undo(); assert.equal(history.canRedo, true);
  history.clear(); assert.equal(history.canUndo, false); assert.equal(history.canRedo, false); assert.equal(text, 'before');
  history.busy = true; assert.throws(() => history.clear(), /finish/);
});

test('empty base searches the entire vault and optional subfolders save directly in the base', () => {
  for (const base of ['', 'Proyectos/Curso']) {
    const settings = { ...defaultSettings(), plannerFolder: base, entryFolder: '', threadFolder: '' };
    assert.equal(creationFolder(settings, 'entry'), base);
    assert.equal(creationFolder(settings, 'thread'), base);
    assert.equal(pathInScope(`${base ? base + '/' : ''}Nota.md`, settings), true);
  }
});

test('legacy scoped folders become relative without changing the old search scope or input data', () => {
  const saved = { searchEntireVault: false, searchFolder: 'Cursos', entryFolder: 'Cursos/Entradas', threadFolder: 'Cursos/Hilos', dayWidth: 250 };
  const copy = structuredClone(saved), loaded = loadSettings(saved);
  assert.equal(loaded.plannerFolder, 'Cursos');
  assert.equal(loaded.entryFolder, 'Entradas');
  assert.equal(loaded.threadFolder, 'Hilos');
  assert.equal(creationFolder(loaded, 'entry'), saved.entryFolder);
  assert.equal(legacyDestinationsChanged(saved, loaded), false);
  assert.deepEqual(saved, copy);
  const outside = loadSettings({ ...saved, threadFolder: 'Planner/Threads' });
  assert.equal(creationFolder(outside, 'thread'), 'Cursos/Threads');
  assert.equal(legacyDestinationsChanged({ ...saved, threadFolder: 'Planner/Threads' }, outside), true);
  assert.equal(pathInScope('Fuera/Nota.md', outside), false);
});

test('new-format folders are not migrated twice and absent settings use fresh defaults', () => {
  const saved = { ...defaultSettings(), plannerFolder: 'Cursos', entryFolder: '' };
  assert.deepEqual(loadSettings(saved), saved);
  assert.deepEqual(loadSettings({}), defaultSettings());
  const bad = loadSettings({ searchEntireVault: false, searchFolder: '../outside', entryFolder: 'Entries' });
  assert.throws(() => validateSettings(bad));
});

test('legacy dated-note settings are ignored without changing saved paths, mappings or input data', () => {
  const current = { ...defaultSettings(), plannerFolder: 'Cursos', entryFolder: '', propertyNames: { date: 'scheduled', title: 'headline', thread: 'project', next: 'following' } };
  for (const showAllDatedNotes of [true, false]) {
    const saved = { ...current, showAllDatedNotes }, copy = structuredClone(saved);
    const loaded = loadSettings(saved);
    assert.deepEqual(loaded, current);
    assert.equal('showAllDatedNotes' in loaded, false);
    assert.deepEqual(saved, copy);
  }
});

test('only explicit planner markers qualify; dates alone and other types remain ordinary notes', () => {
  const note = { date: '2026-10-31', type: 'Reference' };
  const copy = structuredClone(note);
  assert.equal(isPlannerFrontmatter(note), false);
  assert.equal(isEntryFrontmatter(note), false);
  for (const planner_type of ['reference', 'other', '', null, ['entry']]) assert.equal(isPlannerFrontmatter({ ...note, planner_type }), false);
  assert.equal(isPlannerFrontmatter({ scheduled: '2026-10-31' }), false);
  assert.equal(isPlannerFrontmatter(undefined), false);
  assert.equal(isEntryFrontmatter({ ...note, planner_type: 'thread' }), false);
  assert.equal(isPlannerFrontmatter({ ...note, planner_type: 'thread' }), true);
  assert.equal(isEntryFrontmatter({ ...note, planner_type: 'entry' }), true);
  assert.equal(isPlannerFrontmatter({ planner_type: 'entry' }), true);
  assert.deepEqual(note, copy);
});
