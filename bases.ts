import { BasesView, Component, ListValue, Modal, Notice, Setting, TFile, parsePropertyId, type App, type BasesAllOptions, type BasesEntry, type BasesPropertyId, type BasesViewConfig, type Menu, type QueryController } from 'obsidian';
import type JustSimplePlanner from './main';
import { pack, unpack, type MembershipDraft } from './main';
import type { PlannerController } from './controller';
import { EntryModal, MembershipModal } from './modals';
import { History, connected, parseNoteDrop, today, toggleTask, validDay, wikiTarget, type Change, type Entry, type Thread } from './model';
import { defaultSettings, mapEntryFields, validateSettings, type EntryProperty, type PlannerSettings } from './settings';
import { BASES_VIEW_TYPE, movedNoteDates, noteDay, plannerSignature, type MigrationRecord } from './base-model';
import { PlannerSurface } from './view';
import { noteAppearances, type NoteSchedule } from './schedule-model';
import { repeatRule } from './schedule';
import { ScheduleModal } from './schedule-modal';

type Patch = Parameters<JustSimplePlanner['patch']>[0][number];
const PROPERTY_KEYS = { date: 'dateProperty', title: 'titleProperty', thread: 'threadProperty', next: 'nextProperty' } as const;
const SCHEDULE_KEYS = ['endDateProperty', 'repeatProperty', 'repeatUntilProperty', 'repeatExceptProperty', 'additionalDatesProperty'] as const;

/** One live query owns one editing/history session. No vault enumeration or plugin data.json. */
export class BasesPlannerSession extends Component implements PlannerController {
  readonly basesMode = true;
  readonly queryOrder = true;
  settings: PlannerSettings = defaultSettings();
  entries = new Map<string, Entry>();
  threads = new Map<string, Thread>();
  invalid = new Set<string>();
  readonly history: History;
  private ids = new Map<EntryProperty, BasesPropertyId>();
  private records = new Map<string, BasesEntry>();
  private cache = new Map<string, { mtime: number; text: string }>();
  private revision = 0;
  private schema = '';
  private schemaGeneration = 0;
  private issue: string | null = null;
  private stopped = false;
  private writing = false;
  private dialogs = new Set<Modal>();
  private schedules = new Map<string, NoteSchedule>();
  private scheduleWarnings = new Map<string, string[]>();

  constructor(readonly app: App, private readonly host: BasesPlannerView) {
    super();
    this.history = new History({ write: async (path, expected, replacement) => {
      await this.app.vault.process(this.file(path), current => {
        if (current !== expected) throw new Error('The note changed elsewhere. Reopen it before saving or undoing.');
        return replacement;
      });
      this.cache.delete(path);
      this.scheduleRefresh();
    } });
  }

  onload(): void {
    const app = this.app;
    this.registerEvent(app.vault.on('modify', file => {
      if (this.records.has(file.path) || this.threads.has(file.path) || this.pinnedThreads().includes(file.path)) { this.cache.delete(file.path); this.scheduleRefresh(); }
    }));
    this.registerEvent(app.metadataCache.on('changed', file => {
      if (this.records.has(file.path) || this.threads.has(file.path) || this.pinnedThreads().includes(file.path)) this.scheduleRefresh();
    }));
    this.registerEvent(app.metadataCache.on('resolved', () => this.scheduleRefresh()));
    this.registerEvent(app.vault.on('rename', (file, oldPath) => {
      const refs = this.pinnedThreads();
      const next = refs.map(path => path === oldPath || path.startsWith(oldPath + '/') ? file.path + path.slice(oldPath.length) : path);
      if (JSON.stringify(next) !== JSON.stringify(refs)) this.host.config.set('threadNotes', next);
      this.cache.delete(oldPath); this.scheduleRefresh();
    }));
    this.registerEvent(app.vault.on('delete', file => { this.cache.delete(file.path); this.scheduleRefresh(); }));
  }

  get scopeMessage(): string { return 'Bases filters define this planner' + (this.scheduleWarnings.size ? ` · ${this.scheduleWarnings.size} notes with schedule warnings` : ''); }
  get schedulingEnabled(): boolean { return Boolean(this.host.config?.getAsPropertyId('repeatProperty') || this.host.config?.getAsPropertyId('additionalDatesProperty')); }
  get scheduleNotice(): string { return [...this.scheduleWarnings].map(([path, warnings]) => (this.entries.get(path)?.title ?? path) + ': ' + warnings.join(' · ')).join('\n'); }
  get editGeneration(): number { return this.schemaGeneration; }
  configurationIssue(): string | null { return this.issue; }
  file(path: string): TFile { const file = this.app.vault.getAbstractFileByPath(path); if (!(file instanceof TFile)) throw new Error('The note was moved or removed.'); return file; }
  link(path: string): string { return `[[${path.replace(/\.md$/i, '')}]]`; }
  threadValue(thread: string): string { return !thread || thread === 'unassigned' ? '' : thread.startsWith('text:') ? thread.slice(5) : this.link(thread); }
  private target(value: unknown, source: string): string | null { const path = wikiTarget(value); return path ? this.app.metadataCache.getFirstLinkpathDest(path, source)?.path ?? null : null; }
  private thread(value: unknown, source: string): string { return this.target(value, source) ?? (typeof value === 'string' && value.trim() && !wikiTarget(value) ? 'text:' + value : 'unassigned'); }
  private assertLive(): void { if (this.stopped) throw new Error('This planner was closed. Reopen it before saving.'); if (this.issue) throw new Error(this.issue); }
  private assertWritable(field: EntryProperty): void { if (parsePropertyId(this.ids.get(field)!).type !== 'note') throw new Error('The ' + field + ' property is computed or read-only. Choose a writable note property to edit it.'); }
  private pinnedThreads(): string[] { const value: unknown = this.host.config?.get('threadNotes'); return Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : []; }
  private show(modal: Modal): void { this.dialogs.add(modal); modal.open(); }
  newEntry(date: string, thread = '', previous?: string): void { this.show(new EntryModal(this.app, this, { date, thread, previous })); }
  editEntry(entry: Entry): void { const source = this.entries.get(entry.path); if (source) this.show(new EntryModal(this.app, this, { entry: source, date: source.date, thread: source.thread })); }
  refresh(): void { this.host.draw(); }
  scheduleRefresh(): void { this.host.scheduleUpdate(); }
  async perform(action: () => Promise<unknown>): Promise<void> { try { await action(); } catch (error) { new Notice(error instanceof Error ? error.message : String(error), 9000); } finally { this.scheduleRefresh(); } }

  private configure(): void {
    const candidate = defaultSettings(); candidate.entryFolder = ''; candidate.threadFolder = '';
    this.ids.clear();
    for (const field of Object.keys(PROPERTY_KEYS) as EntryProperty[]) {
      const id = this.host.config.getAsPropertyId(PROPERTY_KEYS[field]) ?? `note.${candidate.propertyNames[field]}` as BasesPropertyId;
      this.ids.set(field, id); candidate.propertyNames[field] = parsePropertyId(id).name;
    }
    const width = Number(this.host.config.get('dayWidth') ?? 190);
    candidate.dayWidth = [140, 190, 250].includes(width) ? width : 190;
    const schema = JSON.stringify([...this.ids, ...SCHEDULE_KEYS.map(key => [key, this.host.config.getAsPropertyId(key)])]);
    const selected = [...this.ids.values(), ...SCHEDULE_KEYS.map(key => this.host.config.getAsPropertyId(key)).filter((id): id is BasesPropertyId => id !== null)];
    if (new Set(selected).size !== selected.length) throw new Error('Choose different properties for dates, titles, threads, connections and optional scheduling.');
    if (selected.some(id => { const p = parsePropertyId(id); return p.type === 'note' && ['__proto__', 'constructor', 'prototype', 'planner_type'].includes(p.name.toLowerCase()); })) throw new Error('Choose ordinary note properties for optional scheduling; reserved keys cannot be edited.');
    if (schema !== this.schema) { if (this.history.busy || this.writing) throw new Error('Wait for the current change before updating the view properties.'); this.history.clear(); this.schema = schema; this.schemaGeneration++; }
    this.settings = validateSettings(candidate); this.issue = null;
  }

  private value(entry: BasesEntry, fm: Record<string, unknown>, id: BasesPropertyId): unknown {
    const prop = parsePropertyId(id);
    if (prop.type === 'note') return fm[prop.name];
    const value = entry.getValue(id);
    if (value instanceof ListValue) return Array.from({ length: value.length() }, (_, i) => value.get(i).toString());
    return value?.isTruthy() ? value.toString() : undefined;
  }

  async update(records: BasesEntry[]): Promise<void> {
    const revision = ++this.revision;
    try { this.configure(); } catch (error) { this.issue = error instanceof Error ? error.message : String(error); this.entries.clear(); this.threads.clear(); this.invalid.clear(); this.scheduleWarnings.clear(); this.refresh(); return; }
    this.records = new Map(records.filter(r => r.file.extension === 'md').map(r => [r.file.path, r]));
    const entries = new Map<string, Entry>(); const threads = new Map<string, Thread>(); const invalid = new Set<string>(); const schedules = new Map<string, NoteSchedule>();
    const readThread = (path: string): void => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension !== 'md') return;
      const fm: Record<string, unknown> | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.planner_type !== 'thread') return;
      threads.set(path, { path, title: file.basename, status: fm.status === 'parked' || fm.status === 'closed' ? fm.status : 'active', color: typeof fm.color === 'string' ? fm.color : 'blue', order: typeof fm.order === 'number' ? fm.order : 0 });
    };
    for (const path of this.pinnedThreads()) readThread(path);
    let count = 0;
    for (const [path, record] of this.records) {
      if (this.stopped || revision !== this.revision) return;
      const fm = this.app.metadataCache.getFileCache(record.file)?.frontmatter;
      if (fm?.planner_type === 'thread') { readThread(path); continue; }
      try {
        const cached = this.cache.get(path);
        const mtime = record.file.stat.mtime;
        const text = cached?.mtime === mtime ? cached.text : await this.app.vault.cachedRead(record.file);
        if (this.stopped || revision !== this.revision || record.file.path !== path) return;
        if (record.file.stat.mtime !== mtime) { this.cache.delete(path); this.scheduleRefresh(); return; }
        this.cache.set(path, { mtime, text });
        const document = unpack(text);
        const date = noteDay(this.value(record, document.frontmatter, this.ids.get('date')!));
        if (!date) { invalid.add(path); continue; }
        const title = this.value(record, document.frontmatter, this.ids.get('title')!);
        const thread = this.thread(this.value(record, document.frontmatter, this.ids.get('thread')!), path);
        const nextValue = this.value(record, document.frontmatter, this.ids.get('next')!);
        const next = Array.isArray(nextValue) ? nextValue.map(link => this.target(link, path)).filter((p): p is string => p !== null && p !== path) : [];
        entries.set(path, { path, date, title: typeof title === 'string' && title.trim() ? title : record.file.basename, thread, next: [...new Set(next)], body: document.body, snapshot: text });
        const option = (key: typeof SCHEDULE_KEYS[number]): unknown => { const id = this.host.config.getAsPropertyId(key); return id ? this.value(record, document.frontmatter, id) : undefined; };
        const rawStart = this.value(record, document.frontmatter, this.ids.get('date')!);
        const end = option('endDateProperty'); const repeat = option('repeatProperty');
        schedules.set(path, { start: String(rawStart), end: end == null || end === '' ? null : typeof end === 'string' ? end : 'Invalid end date', repeat: typeof repeat === 'string' ? repeat.trim() : repeat == null ? '' : 'Invalid repeat', until: option('repeatUntilProperty'), except: option('repeatExceptProperty'), additional: option('additionalDatesProperty') });
        if (thread !== 'unassigned' && !thread.startsWith('text:')) readThread(thread);
      } catch { invalid.add(path); }
      if (++count % 50 === 0) await new Promise<void>(resolve => this.host.containerWindow.setTimeout(resolve, 0));
    }
    if (this.stopped || revision !== this.revision) return;
    this.entries = entries; this.threads = threads; this.invalid = invalid; this.schedules = schedules;
    this.scheduleWarnings.clear();
    for (const path of this.cache.keys()) if (!this.records.has(path)) this.cache.delete(path);
    this.refresh();
  }

  rows(): Thread[] {
    const rows = new Map(this.threads);
    for (const entry of this.entries.values()) if (!rows.has(entry.thread)) {
      const file = this.app.vault.getAbstractFileByPath(entry.thread);
      rows.set(entry.thread, { path: entry.thread, title: file instanceof TFile ? file.basename : entry.thread.startsWith('text:') ? entry.thread.slice(5) : 'Unassigned', status: 'active', color: 'blue', order: 9999 });
    }
    const rank = { active: 0, parked: 1, closed: 2 };
    return [...rows.values()].sort((a, b) => rank[a.status] - rank[b.status] || a.order - b.order || a.title.localeCompare(b.title));
  }

  outsideLinks(entry: Entry): number { return entry.next.filter(path => !this.entries.has(path)).length; }
  projectEntries(entries: Entry[], first: string, last: string, notebook = false): Entry[] {
    this.scheduleWarnings.clear();
    return entries.flatMap(entry => {
      const schedule = this.schedules.get(entry.path); if (!schedule) return [entry];
      const projected = noteAppearances(entry, schedule, first, last, notebook);
      const warnings = [...projected.warnings, ...(projected.limited ? ['Limited to 500 appearances in this window'] : [])];
      if (warnings.length) this.scheduleWarnings.set(entry.path, warnings);
      return projected.entries;
    });
  }
  canMove(entry: Entry): boolean {
    const schedule = this.schedules.get(entry.path);
    return !schedule || !schedule.repeat && !(Array.isArray(schedule.additional) ? schedule.additional.length : schedule.additional !== undefined && schedule.additional !== null && schedule.additional !== '');
  }
  flowPaths(start: Iterable<string>): Set<string> {
    const paths = connected(this.entries, start);
    if ([...paths].some(path => this.outsideLinks(this.entries.get(path)!))) { new Notice('This flow continues outside the Base results. Include those entries before selecting or moving the whole flow.'); return new Set(); }
    if ([...paths].some(path => !this.canMove(this.entries.get(path)!))) { new Notice('This flow contains a repeating or additional-date note. Edit its schedule instead of moving the whole flow.'); return new Set(); }
    return paths;
  }

  private dateEdit(fm: Record<string, unknown>, date: string, record?: BasesEntry): { start: unknown; end?: string; endKey: string | null } {
    const dateKey = this.settings.propertyNames.date; const raw = fm[dateKey];
    if (noteDay(raw) === date) return { start: raw, endKey: null };
    for (const key of ['repeatProperty', 'additionalDatesProperty']) {
      const id = this.host.config.getAsPropertyId(key);
      if (!id) continue;
      const prop = parsePropertyId(id);
      if (prop.type !== 'note' && !record) throw new Error('This schedule uses computed properties. Include the note in the Base before changing its date.');
      const value = prop.type === 'note' ? fm[prop.name] : this.value(record!, fm, id);
      if (typeof value === 'string' ? value.trim() : Array.isArray(value) ? value.length : value !== undefined && value !== null) throw new Error('Use the note or its calendar schedule editor to change a repeating or additional-date schedule.');
    }
    const endId = this.host.config.getAsPropertyId('endDateProperty');
    if (endId && parsePropertyId(endId).type !== 'note') throw new Error('The end date is computed. Choose a writable end date property before moving this note.');
    const endKey = endId ? parsePropertyId(endId).name : null;
    if (endKey === dateKey) throw new Error('Use different start and end date properties.');
    return { ...movedNoteDates(noteDay(raw) ? raw : date, endKey ? fm[endKey] : undefined, date), endKey };
  }

  async patch(patches: Patch[]): Promise<void> {
    this.assertLive(); const schema = this.schema; const changes: Change[] = [];
    for (const patch of patches) {
      if (!this.entries.has(patch.path) && !this.threads.has(patch.path)) throw new Error('This note is outside the current planner results.');
      const before = await this.app.vault.read(this.file(patch.path));
      if (patch.expectedText !== undefined && patch.expectedText !== before) throw new Error('The note changed elsewhere. Reopen it before saving.');
      const document = unpack(before); const isThread = document.frontmatter.planner_type === 'thread';
      if (patch.expectedBody !== undefined && patch.expectedBody !== document.body) throw new Error('The note body changed elsewhere. Reopen it before saving.');
      if (patch.expectedDate !== undefined && noteDay(document.frontmatter[this.settings.propertyNames.date]) !== patch.expectedDate) throw new Error('The date changed while you were editing.');
      const fields = { ...patch.fields };
      if (!isThread) {
        for (const field of Object.keys(PROPERTY_KEYS) as EntryProperty[]) if (field in fields) this.assertWritable(field);
        if (typeof fields.date === 'string') {
          const moved = this.dateEdit(document.frontmatter, fields.date, this.records.get(patch.path));
          fields.date = moved.start;
          if (moved.endKey && moved.end) document.frontmatter[moved.endKey] = moved.end;
        }
      }
      Object.assign(document.frontmatter, isThread ? fields : mapEntryFields(fields, this.settings.propertyNames));
      changes.push({ path: patch.path, before, after: pack(document.frontmatter, patch.body ?? document.body) });
    }
    if (schema !== this.schema || this.stopped) throw new Error('The view configuration changed. Reopen the entry.');
    await this.history.commit(changes);
    this.scheduleRefresh();
  }

  async connect(source: string, target: string, remove = false): Promise<void> {
    if (source === target) return;
    if (!this.entries.has(source) || !remove && !this.entries.has(target)) throw new Error('Include both entries in this Base before connecting them.');
    await this.writeConnection(source, target, remove);
  }
  private async writeConnection(source: string, target: string, remove = false): Promise<void> {
    this.assertWritable('next');
    const before = await this.app.vault.read(this.file(source)); const document = unpack(before);
    const value = document.frontmatter[this.settings.propertyNames.next]; const links = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    const next = links.filter(link => this.target(link, source) !== target);
    if (!remove) next.push(this.link(target));
    await this.patch([{ path: source, expectedText: before, fields: { next: [...new Set(next)] } }]);
  }
  async toggleEntryTask(entry: Entry, line: number, checked: boolean): Promise<void> { await this.patch([{ path: entry.path, expectedBody: entry.body, body: toggleTask(entry.body, line, checked) }]); }

  scheduleMenu(menu: Menu, entry: Entry): void {
    const schedule = this.schedules.get(entry.path); if (!schedule) return;
    const writable = (key: string): boolean => { const id = this.host.config.getAsPropertyId(key); return Boolean(id && parsePropertyId(id).type === 'note'); };
    const repeating = Boolean(repeatRule(schedule.repeat) && (writable('repeatUntilProperty') || writable('repeatExceptProperty')));
    const additional = !schedule.repeat && (!schedule.end || noteDay(schedule.end) === entry.occurrence?.sourceDate || noteDay(schedule.end) === entry.date) && writable('additionalDatesProperty');
    if (!repeating && !additional) return;
    menu.addSeparator();
    if (repeating) menu.addItem(item => item.setTitle('Repeat options…').setIcon('repeat').onClick(() => { void this.perform(() => this.editSchedule(entry.path, true)); }));
    if (additional) menu.addItem(item => item.setTitle('Additional dates…').setIcon('calendar-plus').onClick(() => { void this.perform(() => this.editSchedule(entry.path, false)); }));
  }

  private async editSchedule(path: string, repeating: boolean): Promise<void> {
    this.assertLive(); if (!this.entries.has(path)) throw new Error('This note is outside the current Base results.');
    const dateId = this.ids.get('date')!; this.assertWritable('date');
    const ids = [dateId, ...SCHEDULE_KEYS.map(key => this.host.config.getAsPropertyId(key))];
    const names = ids.map(id => id && parsePropertyId(id).type === 'note' ? parsePropertyId(id).name : null);
    const schema = this.schema;
    const file = this.file(path); const text = await this.app.vault.read(file); const source = unpack(text);
    this.assertLive();
    if (schema !== this.schema || file.path !== path || !this.entries.has(path)) throw new Error('The note or view properties changed. Reopen the schedule editor.');
    const start = source.frontmatter[names[0]!]; const first = noteDay(start);
    if (!first) throw new Error('Repair the main date before editing its schedule.');
    const record = this.records.get(path)!;
    const repeat = ids[2] ? this.value(record, source.frontmatter, ids[2]) : undefined;
    const end = ids[1] ? this.value(record, source.frontmatter, ids[1]) : undefined;
    if (repeating && (typeof repeat !== 'string' || !repeatRule(repeat))) throw new Error('The repeat rule changed. Review it in the note before editing its options.');
    if (!repeating && (repeat != null && repeat !== '' || end != null && end !== '' && noteDay(end) !== first)) throw new Error('Additional dates need a single-day note without repetition.');
    const daysName = names[repeating ? 4 : 5]; const untilName = repeating ? names[3] : null;
    if (!daysName && !untilName) throw new Error('Select writable properties in Optional scheduling first.');
    const expected = names.filter((name): name is string => name !== null).map(name => [name, JSON.stringify(source.frontmatter[name])] as const);
    this.show(new ScheduleModal(this.app, {
      title: repeating ? 'Repeat options' : 'Additional dates', firstDay: first, repeating,
      days: daysName ? source.frontmatter[daysName] : undefined, until: untilName ? source.frontmatter[untilName] : undefined,
      editDays: Boolean(daysName), editUntil: Boolean(untilName),
      save: async draft => {
        this.assertLive();
        if (schema !== this.schema || file.path !== path || !this.entries.has(path)) throw new Error('The note or view properties changed. Reopen the schedule editor.');
        const before = await this.app.vault.read(file); const current = unpack(before);
        if (expected.some(([key, value]) => JSON.stringify(current.frontmatter[key]) !== value)) throw new Error('The schedule changed elsewhere. Your draft is still here; reopen the editor to use the new dates.');
        if (daysName) { if (draft.days.length) current.frontmatter[daysName] = draft.days; else delete current.frontmatter[daysName]; }
        if (untilName) { if (draft.until) current.frontmatter[untilName] = draft.until; else delete current.frontmatter[untilName]; }
        if (schema !== this.schema || this.stopped) throw new Error('The view properties changed. Reopen the schedule editor.');
        await this.history.commit([{ path, before, after: pack(current.frontmatter, current.body) }]);
        this.scheduleRefresh();
      },
    }));
  }

  /** Capture only files actually created during the public Bases creation call. */
  private async createNote(title: string, fields: Record<string, unknown>): Promise<TFile> {
    this.assertLive(); if (this.writing) throw new Error('Finish creating the current note first.');
    this.writing = true; const schema = this.schema; const created: TFile[] = []; let expected: Record<string, unknown> | null = null;
    const ref = this.app.vault.on('create', file => { if (file instanceof TFile && file.extension === 'md') created.push(file); });
    try {
      await this.host.createFileForView(title, fm => {
        this.assertLive(); if (schema !== this.schema) throw new Error('The view properties changed. Try creating the note again.');
        Object.assign(fm, fields); expected = JSON.parse(JSON.stringify(fm)) as Record<string, unknown>;
      });
      const matches: TFile[] = [];
      if (expected) for (const file of created) {
        const document = unpack(await this.app.vault.read(file));
        if (Object.entries(expected).every(([key, value]) => JSON.stringify(document.frontmatter[key]) === JSON.stringify(value))) matches.push(file);
      }
      if (matches.length !== 1) throw new Error('Bases created the note, but it could not be identified safely. No continuation or body was written; review the new note.');
      return matches[0];
    } finally { this.app.vault.offref(ref); this.writing = false; }
  }

  async createEntry(title: string, date: string, thread: string, body: string, previous?: string): Promise<void> {
    if (!validDay(date) || !title.trim()) throw new Error('Enter a title and valid date.');
    this.assertWritable('date'); this.assertWritable('title'); if (thread && thread !== 'unassigned') this.assertWritable('thread');
    if (previous && !this.entries.has(previous)) throw new Error('The preceding entry is no longer in this Base.');
    const fields = { planner_type: 'entry', ...mapEntryFields({ title, date, thread: this.threadValue(thread), next: [] }, this.settings.propertyNames) };
    const file = await this.createNote(title, fields);
    this.assertLive();
    if (body) await this.app.vault.process(file, current => { const doc = unpack(current); return pack(doc.frontmatter, doc.body.trim() ? doc.body.trimEnd() + '\n\n' + body : body); });
    if (previous) {
      try { await this.writeConnection(previous, file.path); } catch (error) { new Notice('Note created; the continuation was not added: ' + (error instanceof Error ? error.message : String(error)), 9000); }
    }
    this.scheduleRefresh();
  }

  async createThread(title: string, color: string, status: string): Promise<void> {
    const file = await this.createNote(title, { planner_type: 'thread', color, status, order: this.threads.size });
    this.host.config.set('threadNotes', [...new Set([...this.pinnedThreads(), file.path])]); this.scheduleRefresh();
  }

  droppedNote(data: DataTransfer): TFile | null {
    const path = parseNoteDrop(data.getData('text/plain'), data.getData('text/uri-list'), this.app.vault.getName());
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path) ?? this.app.vault.getAbstractFileByPath(path + '.md') ?? this.app.metadataCache.getFirstLinkpathDest(path, '');
    return file instanceof TFile && file.extension === 'md' ? file : null;
  }
  async reviewNote(file: TFile, options: { thread?: string; date?: string; remove?: boolean } = {}): Promise<void> {
    this.assertLive();
    if (options.remove && !this.entries.has(file.path)) throw new Error('This note is outside the current planner results.');
    const text = await this.app.vault.read(file); const doc = unpack(text);
    if (options.remove ? doc.frontmatter.planner_type !== 'entry' : doc.frontmatter.planner_type && doc.frontmatter.planner_type !== 'entry') throw new Error(options.remove ? 'Only notes marked planner_type: entry can be removed from the planner.' : 'Thread notes and notes with another planner type cannot become entries.');
    const props = this.settings.propertyNames; const originalThread = this.thread(doc.frontmatter[props.thread], file.path);
    const draft: MembershipDraft = { file, path: file.path, text, frontmatter: doc.frontmatter, body: doc.body, generation: this.schemaGeneration, title: typeof doc.frontmatter[props.title] === 'string' ? doc.frontmatter[props.title] as string : file.basename, originalThread, thread: options.thread ?? originalThread, date: options.date ?? noteDay(doc.frontmatter[props.date]) ?? today() };
    this.show(new MembershipModal(this.app, this, draft, Boolean(options.remove)));
  }
  async saveMembership(draft: MembershipDraft, date: string, thread: string, remove: boolean): Promise<void> {
    this.assertLive();
    if (draft.generation !== this.schemaGeneration) throw new Error('The view properties changed. Reopen the review before saving.');
    if (this.app.vault.getAbstractFileByPath(draft.path) !== draft.file) throw new Error('The note was moved. Reopen the review.');
    const fm: Record<string, unknown> = { ...draft.frontmatter };
    if (remove) {
      if (!this.entries.has(draft.path)) throw new Error('This note is outside the current planner results.');
      if (fm.planner_type !== 'entry') throw new Error('This note is no longer a planner entry.');
      delete fm.planner_type;
    } else {
      this.assertWritable('date'); this.assertWritable('thread');
      fm.planner_type = 'entry';
      const moved = this.dateEdit(fm, date, this.records.get(draft.path));
      if (moved.endKey && moved.end) fm[moved.endKey] = moved.end;
      Object.assign(fm, mapEntryFields({ date: moved.start, thread: this.threadValue(thread) }, this.settings.propertyNames));
    }
    await this.history.commit([{ path: draft.path, before: draft.text, after: pack(fm, draft.body) }]);
    new Notice(remove ? 'Planner marker removed. The note is kept; Bases filters determine whether it is hidden. Undo is available in this planner.' : 'Note updated in place. This Base\'s filters still determine whether it appears.'); this.scheduleRefresh();
  }

  manageThreads(): void {
    const modal = new Modal(this.app); modal.setTitle('Thread notes for this view');
    modal.contentEl.createEl('p', { text: 'Linked thread notes are read directly. Keep selected thread notes here to show their empty rows even when they are outside the Base filters. Files are never moved or deleted.' });
    const refs = new Set(this.pinnedThreads()); const list = modal.contentEl.createDiv();
    const render = (): void => {
      list.empty(); for (const path of refs) new Setting(list).setName(path).addButton(b => b.setButtonText('Remove row').onClick(() => { refs.delete(path); render(); }));
    };
    let target = '';
    new Setting(modal.contentEl).setName('Thread note link').addText(t => t.setPlaceholder('[[thread note]]').onChange(value => { target = value; })).addButton(b => b.setButtonText('Add row').onClick(() => {
      const file = this.app.metadataCache.getFirstLinkpathDest(wikiTarget(target) ?? target, '');
      if (!file || this.app.metadataCache.getFileCache(file)?.frontmatter?.planner_type !== 'thread') { new Notice('Choose a Markdown note with planner_type: thread.'); return; }
      refs.add(file.path); render();
    }));
    render(); new Setting(modal.contentEl).addButton(b => b.setButtonText('Cancel').onClick(() => modal.close())).addButton(b => b.setButtonText('Save').setCta().onClick(() => { if (this.stopped) return; this.host.config.set('threadNotes', [...refs]); modal.close(); this.scheduleRefresh(); }));
    this.show(modal);
  }
  onunload(): void { this.stopped = true; this.revision++; for (const modal of this.dialogs) modal.close(); this.dialogs.clear(); this.cache.clear(); }
}

export class BasesPlannerView extends BasesView {
  readonly type = BASES_VIEW_TYPE;
  readonly surface: PlannerSurface;
  readonly session: BasesPlannerSession;
  private timer = 0;
  private disposed = false;
  private restored = false;
  private report: HTMLElement;
  get containerWindow(): Window { return this.parentEl.win; }

  constructor(controller: QueryController, private readonly parentEl: HTMLElement) {
    super(controller);
    parentEl.addClass('jsp-bases-container');
    this.report = parentEl.createDiv({ cls: 'jsp-migration-report', attr: { role: 'status' } });
    const content = parentEl.createDiv({ cls: 'jsp-bases-content' });
    this.session = this.addChild(new BasesPlannerSession(this.app, this));
    this.surface = new PlannerSurface(this.app, content, this.session, () => {
      if (!this.restored || this.disposed) return;
      const state = this.surface.getState();
      if (JSON.stringify(this.config.get('plannerState')) !== JSON.stringify(state)) this.config.set('plannerState', state);
    });
    this.addChild(this.surface);
    this.register(() => { this.disposed = true; this.containerWindow.clearTimeout(this.timer); parentEl.removeClass('jsp-bases-container'); this.surface.unload(); this.session.unload(); parentEl.empty(); });
  }
  onDataUpdated(): void {
    if (!this.restored) {
      const state: unknown = this.config.get('plannerState'); this.restored = true;
      if (state && typeof state === 'object' && !Array.isArray(state)) void this.surface.setState(state as Record<string, unknown>);
    }
    this.scheduleUpdate();
  }
  scheduleUpdate(): void {
    if (this.disposed) return;
    this.containerWindow.clearTimeout(this.timer);
    this.timer = this.containerWindow.setTimeout(() => { this.timer = 0; if (!this.disposed && this.data) void this.session.update(this.data.data); }, 60);
  }
  draw(): void {
    if (this.disposed) return;
    this.surface.render();
    const issue = this.session.configurationIssue();
    if (issue) { this.report.hidden = false; this.report.addClass('is-warning'); this.report.setText(issue); return; }
    const value: unknown = this.config.get('migration');
    this.report.empty();
    if (!value || typeof value !== 'object' || !('signature' in value)) { this.report.hidden = true; return; }
    this.report.hidden = false;
    const migration = value as MigrationRecord;
    const match = migration.signature === plannerSignature(this.session.entries.values(), this.session.threads.values()) && JSON.stringify([...this.session.invalid].sort()) === JSON.stringify(migration.invalid);
    const verified = this.config.get('migrationVerified') === true;
    this.report.toggleClass('is-warning', !match && !verified);
    this.report.createSpan({ text: verified ? 'Migration verified. Classic notes remain compatible. This Base can now be filtered independently.' : match ? `Migration verified: ${this.session.entries.size} entries, ${this.session.threads.size} thread notes and their connections match the classic planner.` : `Checking migration: ${this.session.entries.size}/${migration.entries.length} entries · ${this.session.threads.size}/${migration.threads.length} thread notes. Wait for loading; if counts differ, review the Base filters and note properties.` });
    if (match && !verified) this.config.set('migrationVerified', true);
  }
}

export function plannerBasesOptions(config?: BasesViewConfig): BasesAllOptions[] {
  return [
    { type: 'property', key: 'dateProperty', displayName: 'Date property', placeholder: 'date (default)' },
    { type: 'property', key: 'titleProperty', displayName: 'Title property', placeholder: 'title (default)' },
    { type: 'property', key: 'threadProperty', displayName: 'Thread property', placeholder: 'thread (default)' },
    { type: 'property', key: 'nextProperty', displayName: 'Connections property', placeholder: 'next (default)' },
    { type: 'property', key: 'endDateProperty', displayName: 'End date property (optional)', placeholder: 'None - single-day cards' },
    { type: 'group', displayName: 'Optional scheduling', items: [
      { type: 'property', key: 'repeatProperty', displayName: 'Repeat property (optional)', placeholder: 'None - no repetition' },
      { type: 'property', key: 'repeatUntilProperty', displayName: 'Repeat until property (optional)', placeholder: 'None - no end date', shouldHide: () => !config?.getAsPropertyId('repeatProperty') },
      { type: 'property', key: 'repeatExceptProperty', displayName: 'Skipped dates property (optional)', placeholder: 'None - no skipped dates', shouldHide: () => !config?.getAsPropertyId('repeatProperty') },
      { type: 'property', key: 'additionalDatesProperty', displayName: 'Additional dates property (optional)', placeholder: 'None - use only the main date' },
    ] },
    { type: 'dropdown', key: 'dayWidth', displayName: 'Day width', default: '190', options: { '140': 'Compact', '190': 'Comfortable', '250': 'Wide' } },
  ];
}
