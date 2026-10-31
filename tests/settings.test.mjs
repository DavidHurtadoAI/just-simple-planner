import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, cloneSettings, cleanFolder, validateSettings, readEntryProperties, mapEntryFields, changesIndex, creationFolder, hasLegacyScope } from '../settings.ts';
import { History, isEntryFrontmatter, isPlannerFrontmatter } from '../model.ts';

test('English defaults are independent vault-relative creation destinations', () => {
  const settings = defaultSettings();
  assert.equal(creationFolder(settings, 'entry'), 'Planner/Entries');
  assert.equal(creationFolder(settings, 'thread'), 'Planner/Threads');
  assert.equal('plannerFolder' in settings, false);
  assert.equal('showAllDatedNotes' in settings, false);
  settings.propertyNames.date = 'fecha';
  assert.equal(defaultSettings().propertyNames.date, 'date');
});

test('legacy common base becomes full destinations without moving or changing input', () => {
  const saved = { plannerFolder: 'Cursos/IA', entryFolder: 'Entradas', threadFolder: 'Hilos', dayWidth: 250, propertyNames: { date: 'scheduled', title: 'headline', thread: 'project', next: 'following' } };
  const copy = structuredClone(saved), loaded = loadSettings(saved);
  assert.equal(loaded.entryFolder, 'Cursos/IA/Entradas');
  assert.equal(loaded.threadFolder, 'Cursos/IA/Hilos');
  assert.deepEqual(loaded.propertyNames, saved.propertyNames);
  assert.equal(loaded.dayWidth, 250);
  assert.equal('plannerFolder' in loaded, false);
  assert.equal(hasLegacyScope(saved), true);
  assert.deepEqual(saved, copy);
  assert.deepEqual(loadSettings(loaded), loaded);
});

test('empty legacy children and bases retain exact destinations', () => {
  for (const [base, child, expected] of [['Cursos', '', 'Cursos'], ['', 'Notas', 'Notas'], ['', '', '']]) {
    const loaded = loadSettings({ plannerFolder: base, entryFolder: child, threadFolder: child });
    assert.equal(loaded.entryFolder, expected);
    assert.equal(loaded.threadFolder, expected);
  }
  const missing = loadSettings({ plannerFolder: 'Curso' });
  assert.equal(missing.entryFolder, 'Curso/Entries');
  assert.equal(missing.threadFolder, 'Curso/Threads');
});

test('older separate search scopes are discarded and vault-relative creation paths survive', () => {
  const saved = { searchEntireVault: false, searchFolder: 'Buscar', entryFolder: 'Otra/Entradas', threadFolder: '', dayWidth: 140 };
  assert.equal(hasLegacyScope(saved), true);
  const loaded = loadSettings(saved);
  assert.equal(loaded.entryFolder, 'Otra/Entradas');
  assert.equal(loaded.threadFolder, '');
  assert.equal(loaded.dayWidth, 140);
  assert.equal('searchFolder' in loaded, false);
  assert.equal(hasLegacyScope(loaded), false);
  assert.deepEqual(loadSettings(null), defaultSettings());
  assert.deepEqual(loadSettings({}), defaultSettings());
});

test('invalid legacy folder components stay invalid instead of silently enabling another path', () => {
  for (const saved of [{plannerFolder:'../outside',entryFolder:'Entries'}, {plannerFolder:'Planner',entryFolder:'/outside'}, {plannerFolder:'Planner',entryFolder:'C:\\outside'}]) assert.throws(() => validateSettings(loadSettings(saved)));
});

test('folder validation rejects absolute paths and traversal while optional destinations use vault root', () => {
  assert.equal(cleanFolder(' Projects\\Work//Sub/ '), 'Projects/Work/Sub');
  for (const value of ['/outside','C:\\outside','\\\\server\\share','../outside','Folder/../Outside','./Folder']) assert.throws(() => cleanFolder(value));
  for (const key of ['entryFolder','threadFolder']) assert.throws(() => validateSettings({...defaultSettings(),[key]:'../outside'}));
  const root = {...defaultSettings(),entryFolder:'',threadFolder:''};
  assert.equal(creationFolder(root,'entry'), '');
  assert.equal(creationFolder(root,'thread'), '');
});

test('only property mapping changes reset the index and session history', () => {
  const saved = defaultSettings(), next = cloneSettings(saved);
  next.entryFolder = 'Clientes'; next.threadFolder = 'Hilos'; next.dayWidth = 250;
  assert.equal(changesIndex(saved,next),false);
  next.propertyNames.next = 'following';
  assert.equal(changesIndex(saved,next),true);
  assert.equal(saved.propertyNames.next,'next');
});

test('removed dated-note settings never restore automatic inclusion', () => {
  for (const flag of [true,false]) {
    const saved = {...defaultSettings(),showAllDatedNotes:flag}, copy = structuredClone(saved);
    assert.deepEqual(loadSettings(saved),defaultSettings());
    assert.deepEqual(saved,copy);
  }
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

test('clearing history cannot write files and drops both undo and redo', async () => {
  let text = 'before'; const history = new History({ async write(path, expected, next) { assert.equal(text, expected); text = next; } });
  await history.commit([{ path: 'Entry.md', before: 'before', after: 'after' }]);
  await history.undo(); assert.equal(history.canRedo, true);
  history.clear(); assert.equal(history.canUndo, false); assert.equal(history.canRedo, false); assert.equal(text, 'before');
  history.busy = true; assert.throws(() => history.clear(), /finish/);
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
