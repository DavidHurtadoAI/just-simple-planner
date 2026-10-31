import { Plugin, Notice, TFile, TFolder, normalizePath, getFrontMatterInfo, parseYaml, stringifyYaml, type TAbstractFile } from 'obsidian';
import { History, today, validDay, wikiTarget, toggleTask, isEntryFrontmatter, isPlannerFrontmatter, type Entry, type Thread, type Change, parseNoteDrop, admissionFields } from './model';
import { PlannerView, VIEW_TYPE, PLANNER_ICON } from './view';
import { EntryModal, ThreadModal, MembershipModal } from './modals';
import { defaultSettings, loadSettings, validateSettings, cleanFolder, readEntryProperties, mapEntryFields, changesIndex, creationFolder, hasLegacyScope, type PlannerSettings } from './settings';
import { PlannerSettingsTab } from './settings-tab';
export type { PlannerSettings } from './settings';

export function unpack(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const info = getFrontMatterInfo(text);
  const parsed: unknown = info.exists ? parseYaml(info.frontmatter) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The note has invalid frontmatter.');
  return { frontmatter: parsed as Record<string, unknown>, body: text.slice(info.contentStart) };
}

export function pack(frontmatter: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n${body}`;
}


export interface MembershipDraft {
  file: TFile;
  path: string;
  text: string;
  frontmatter: Record<string, unknown>;
  body: string;
  generation: number;
  title: string;
  originalThread: string;
  thread: string;
  date: string;
}

export default class JustSimplePlanner extends Plugin {
  settings: PlannerSettings = defaultSettings();
  entries = new Map<string, Entry>();
  threads = new Map<string, Thread>();
  invalid = new Set<string>();
  history!: History;
  private refreshTimer: number | null = null;
  private indexDiscovered = false;
  private indexRevisions = new Map<string, number>();
  private indexRefresh: Promise<void> | null = null;
  private indexPending = false;
  private stopping = false;
  private indexGeneration = 0;
  private applyingSettings = false;
  private settingsTab: PlannerSettingsTab | null = null;

  async onload(): Promise<void> {
    const saved: unknown = await this.loadData();
    this.settings = loadSettings(saved);
    try { this.settings = validateSettings(this.settings); }
    catch (error) { new Notice(`Review planner settings: ${error instanceof Error ? error.message : String(error)}`, 9000); }
    if (hasLegacyScope(saved)) new Notice('Planner folders now only choose where new notes are created. Marked entries and threads are found anywhere in the vault. Existing creation paths are preserved; no files were moved.', 12000);
    this.history = new History({ write: async (path, expected, replacement) => {
      this.assertCanWrite();
      const file = this.file(path);
      await this.app.vault.process(file, current => {
        if (current !== expected) throw new Error(`Note changed outside the planner: ${file.basename}.`);
        return replacement;
      });
      this.indexText(file, replacement);
    } });
    this.registerView(VIEW_TYPE, leaf => new PlannerView(leaf, this));
    this.registerHoverLinkSource(VIEW_TYPE, { display: 'Just Simple Planner', defaultMod: false });
    this.addRibbonIcon(PLANNER_ICON, 'Open Just Simple Planner', () => { void this.perform(() => this.openPlanner()); });
    this.addCommand({ id: 'open-planner', name: 'Open planner', callback: () => { void this.perform(() => this.openPlanner()); } });
    this.addCommand({ id: 'new-entry', name: 'New entry', callback: () => this.newEntry(today()) });
    this.addCommand({ id: 'new-thread', name: 'New thread', callback: () => new ThreadModal(this.app, this).open() });
    this.addCommand({ id: 'add-active-note', name: 'Add active note to planner', checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== 'md') return false;
      if (!checking) void this.perform(() => this.reviewNote(file));
      return true;
    } });
    this.addCommand({ id: 'remove-active-note', name: 'Remove active note from planner', checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file || this.app.metadataCache.getFileCache(file)?.frontmatter?.planner_type !== 'entry') return false;
      if (!checking) void this.perform(() => this.reviewNote(file, { remove: true }));
      return true;
    } });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile) || file.extension !== 'md') return;
      const type: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.planner_type;
      if (type === 'thread') return;
      menu.addSeparator();
      if (this.entries.has(file.path)) menu.addItem(item => item.setTitle('Show in planner').setIcon('workflow').onClick(() => { void this.perform(() => this.showEntry(file.path)); }));
      else menu.addItem(item => item.setTitle('Add note to planner…').setIcon('workflow').onClick(() => { void this.perform(() => this.reviewNote(file)); }));
      if (type === 'entry') menu.addItem(item => item.setTitle('Remove note from planner…').setIcon('minus-circle').onClick(() => { void this.perform(() => this.reviewNote(file, { remove: true })); }));
    }));
    this.settingsTab = new PlannerSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.registerEvent(this.app.metadataCache.on('changed', (file, text) => {
      if (!this.isKnown(file.path) && !this.hasPlannerMetadata(file)) return;
      this.indexText(file, text); this.scheduleRefresh();
    }));
    this.registerEvent(this.app.metadataCache.on('resolved', () => {
      if (!this.indexDiscovered) { void this.perform(() => this.reloadIndex()); return; }
      // Resolve links from the latest in-memory snapshots, without rereading every note.
      for (const entry of [...this.entries.values()]) {
        const file = this.app.vault.getAbstractFileByPath(entry.path);
        if (file instanceof TFile && entry.snapshot !== undefined) this.indexText(file, entry.snapshot);
      }
      this.scheduleRefresh();
    }));
    this.registerEvent(this.app.vault.on('delete', file => {
      for (const path of this.knownPaths()) if (path === file.path || path.startsWith(`${file.path}/`)) this.forget(path);
      this.scheduleRefresh();
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      void this.perform(() => this.reindexRenamed(file, oldPath));
    }));
    this.register(() => { this.stopping = true; if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer); });
    this.app.workspace.onLayoutReady(() => { void this.perform(() => this.reloadIndex()); });
  }

  file(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Note no longer exists: ${path}`);
    return file;
  }

  resolveLink(value: unknown, source: string): string | null {
    const target = wikiTarget(value);
    if (!target) return null;
    return this.app.metadataCache.getFirstLinkpathDest(target, source)?.path ?? null;
  }

  link(path: string): string { return `[[${path.replace(/\.md$/i, '')}]]`; }

  configurationIssue(): string | null {
    try { validateSettings(this.settings); } catch (error) { return error instanceof Error ? error.message : String(error); }
    for (const path of [this.settings.entryFolder, this.settings.threadFolder]) if (this.folderIsFile(path)) return 'A new-note folder points to a file. Choose a folder inside this vault.';
    return null;
  }

  async applySettings(candidate: PlannerSettings): Promise<void> {
    if (this.applyingSettings || this.history.busy) throw new Error('Wait for the current planner change to finish before applying settings.');
    const next = validateSettings(candidate);
    for (const path of [creationFolder(next, 'entry'), creationFolder(next, 'thread')]) if (this.folderIsFile(path)) throw new Error('A folder path points to a file. Choose a folder inside this vault.');
    const rebuild = changesIndex(this.settings, next);
    this.applyingSettings = true;
    try {
      await this.saveData(next);
      this.settings = next;
      if (rebuild) {
        this.indexGeneration++;
        this.entries.clear(); this.threads.clear(); this.invalid.clear(); this.indexRevisions.clear();
        this.indexDiscovered = false; this.history.clear();
        await this.reloadIndex();
      } else this.refresh();
    } finally { this.applyingSettings = false; }
    this.settingsTab?.synchronize();
  }

  private assertCanWrite(): void {
    if (this.applyingSettings) throw new Error('Planner settings are being applied. Try again after they finish.');
    const issue = this.configurationIssue();
    if (issue) throw new Error(issue);
  }

  private folderIsFile(path: string): boolean {
    const parts = path.split('/').filter(Boolean);
    return parts.some((_, index) => this.app.vault.getAbstractFileByPath(parts.slice(0, index + 1).join('/')) instanceof TFile);
  }

  private knownPaths(): Set<string> { return new Set([...this.entries.keys(), ...this.threads.keys(), ...this.invalid]); }

  private isKnown(path: string): boolean { return this.entries.has(path) || this.threads.has(path) || this.invalid.has(path); }

  private hasPlannerMetadata(file: TFile, oldPath?: string): boolean {
    const cache = this.app.metadataCache.getFileCache(file) ?? (oldPath ? this.app.metadataCache.getCache(oldPath) : null);
    return file.extension === 'md' && isPlannerFrontmatter(cache?.frontmatter);
  }

  private forget(path: string): void {
    this.indexRevisions.set(path, (this.indexRevisions.get(path) ?? 0) + 1);
    this.entries.delete(path); this.threads.delete(path); this.invalid.delete(path);
  }

  private async reindexRenamed(file: TAbstractFile, oldPath: string): Promise<void> {
    const oldPaths = [...this.knownPaths()].filter(path => path === oldPath || path.startsWith(`${oldPath}/`));
    for (const path of oldPaths) this.forget(path);
    const previous = oldPaths.map(path => this.app.vault.getAbstractFileByPath(normalizePath(`${file.path}${path.slice(oldPath.length)}`))).filter((item): item is TFile => item instanceof TFile);
    const discovered = file instanceof TFile ? oldPaths.length || this.hasPlannerMetadata(file, oldPath) ? [file] : [] : file instanceof TFolder ? this.plannerFilesInFolder(file, oldPath) : [];
    const destinations = new Set([...previous, ...discovered]);
    for (const destination of destinations) {
      if (this.stopping) return;
      const generation = this.indexGeneration;
      const path = destination.path;
      const revision = this.indexRevisions.get(path);
      const text = await this.readIndexText(destination);
      if (text !== null && generation === this.indexGeneration && destination.path === path && this.indexRevisions.get(path) === revision) this.indexText(destination, text);
    }
    if (oldPaths.length || destinations.size) await this.reloadIndex();
  }

  private plannerFilesInFolder(folder: TFolder, oldPath?: string): TFile[] {
    const result: TFile[] = [];
    for (const child of folder.children) {
      const previousPath = oldPath ? `${oldPath}/${child.name}` : undefined;
      if (child instanceof TFolder) result.push(...this.plannerFilesInFolder(child, previousPath));
      else if (child instanceof TFile && this.hasPlannerMetadata(child, previousPath)) result.push(child);
    }
    return result;
  }

  private async discoverPlannerPaths(): Promise<Set<string>> {
    const paths = new Set<string>();
    const files = this.app.vault.getMarkdownFiles();
    for (let index = 0; index < files.length; index++) {
      if (this.stopping) break;
      const file = files[index];
      if (this.hasPlannerMetadata(file)) paths.add(file.path);
      // Large vaults must not monopolize the UI while checking cached properties.
      if (index && index % 500 === 0) await new Promise<void>(resolve => window.setTimeout(resolve, 0));
    }
    return paths;
  }

  private async readIndexText(file: TFile): Promise<string | null> {
    const path = file.path;
    try {
      const text = await this.app.vault.cachedRead(file);
      return file.path === path && this.app.vault.getAbstractFileByPath(path) === file ? text : null;
    } catch (error) {
      // Rapid folder moves can invalidate an in-flight read; rename/metadata events supply its new path.
      if (file.path !== path || this.app.vault.getAbstractFileByPath(path) !== file || (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) return null;
      throw error;
    }
  }

  indexText(file: TFile, text: string): void {
    this.forget(file.path);
    if (file.extension !== 'md') return;
    try {
      const { frontmatter: fm, body } = unpack(text);
      if (fm.planner_type === 'thread') {
        this.threads.set(file.path, { path: file.path, title: file.basename, status: fm.status === 'parked' || fm.status === 'closed' ? fm.status : 'active', color: typeof fm.color === 'string' ? fm.color : 'blue', order: typeof fm.order === 'number' ? fm.order : 0 });
      } else if (isEntryFrontmatter(fm)) {
        const props = readEntryProperties(fm, this.settings.propertyNames);
        if (!validDay(props.date)) { this.invalid.add(file.path); return; }
        const thread = this.entryThread(props.thread, file.path) || 'unassigned';
        const next = Array.isArray(props.next) ? props.next.map(item => this.resolveLink(item, file.path)).filter((path): path is string => path !== null && path !== file.path) : [];
        this.entries.set(file.path, { path: file.path, title: typeof props.title === 'string' && props.title.trim() ? props.title : file.basename.replace(/^\d{4}-\d{2}-\d{2} - /, ''), date: props.date, thread, next: [...new Set(next)], body, snapshot: text });
      }
    } catch (error) {
      if (this.app.metadataCache.getFileCache(file)?.frontmatter?.planner_type) this.invalid.add(file.path);
      console.debug('Just Simple Planner: note was not indexed', file.path, error);
    }
  }

  async reloadIndex(): Promise<void> {
    if (this.stopping) return;
    this.indexPending = true;
    if (!this.indexRefresh) this.indexRefresh = this.refreshIndex().finally(() => { this.indexRefresh = null; });
    await this.indexRefresh;
  }

  private async refreshIndex(): Promise<void> {
    do {
      this.indexPending = false;
      const generation = this.indexGeneration;
      // One initial cache-only pass; later file events discover newly marked notes.
      const paths = this.indexDiscovered ? this.knownPaths() : await this.discoverPlannerPaths();
      if (this.stopping) return;
      if (generation !== this.indexGeneration) { this.indexPending = true; continue; }
      this.indexDiscovered = true;
      for (const path of paths) {
        if (this.stopping) return;
        if (generation !== this.indexGeneration) { this.indexPending = true; break; }
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) { this.forget(path); continue; }
        const revision = this.indexRevisions.get(path);
        const text = await this.readIndexText(file);
        // A metadata event or rename may have supplied a newer snapshot while reading.
        if (text !== null && !this.stopping && generation === this.indexGeneration && file.path === path && this.indexRevisions.get(path) === revision) this.indexText(file, text);
      }
    } while (this.indexPending && !this.stopping);
    if (!this.stopping) this.refresh();
  }

  rows(): Thread[] {
    const rows = new Map(this.threads);
    for (const entry of this.entries.values()) if (!rows.has(entry.thread)) {
      const file = this.app.vault.getAbstractFileByPath(entry.thread);
      rows.set(entry.thread, { path: entry.thread, title: file instanceof TFile ? file.basename : entry.thread.startsWith('text:') ? entry.thread.slice(5) : 'Unassigned', color: 'blue', status: 'active', order: 9999 });
    }
    const rank = { active: 0, parked: 1, closed: 2 };
    return [...rows.values()].sort((a, b) => rank[a.status] - rank[b.status] || a.order - b.order || a.title.localeCompare(b.title));
  }

  scheduleRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => { this.refreshTimer = null; this.refresh(); }, 100);
  }

  refresh(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof PlannerView) leaf.view.render();
  }

  async openPlanner(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) { leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
    await this.app.workspace.revealLeaf(leaf);
  }

  newEntry(date: string, thread = '', previous?: string): void { new EntryModal(this.app, this, { date, thread, previous }).open(); }
  editEntry(entry: Entry): void { new EntryModal(this.app, this, { entry, date: entry.date, thread: entry.thread }).open(); }

  threadValue(thread: string): string {
    return thread && thread !== 'unassigned' ? thread.startsWith('text:') ? thread.slice(5) : this.link(thread) : '';
  }

  private entryThread(value: unknown, source: string): string {
    return this.resolveLink(value, source) ?? (typeof value === 'string' && value.trim() && !wikiTarget(value) ? 'text:' + value : '');
  }

  async reviewNote(file: TFile, options: { thread?: string; date?: string; remove?: boolean } = {}): Promise<void> {
    this.assertCanWrite();
    if (file.extension !== 'md') throw new Error('Choose one existing Markdown note.');
    const generation = this.indexGeneration;
    const path = file.path;
    const text = await this.app.vault.read(file);
    if (generation !== this.indexGeneration || file.path !== path) throw new Error('The note or property mapping changed. Try again.');
    const { frontmatter, body } = unpack(text);
    if (options.remove ? frontmatter.planner_type !== 'entry' : frontmatter.planner_type && frontmatter.planner_type !== 'entry') {
      throw new Error(options.remove ? 'This note is not marked as a planner entry.' : 'This note already uses planner_type for another purpose. Thread notes cannot become entries.');
    }
    const props = readEntryProperties(frontmatter, this.settings.propertyNames);
    const originalThread = this.entryThread(props.thread, path);
    const draft: MembershipDraft = {
      file, path, text, frontmatter, body, generation, originalThread,
      title: typeof props.title === 'string' && props.title.trim() ? props.title : file.basename,
      thread: options.thread === undefined ? originalThread : options.thread === 'unassigned' ? '' : options.thread,
      date: options.date ?? (validDay(props.date) ? props.date : today()),
    };
    new MembershipModal(this.app, this, draft, Boolean(options.remove)).open();
  }

  async saveMembership(draft: MembershipDraft, date: string, thread: string, remove: boolean): Promise<void> {
    this.assertCanWrite();
    if (draft.generation !== this.indexGeneration) throw new Error('Property mapping changed. Reopen this note before saving.');
    if (this.app.vault.getAbstractFileByPath(draft.path) !== draft.file) throw new Error('The note was moved or replaced. Reopen it before saving.');
    const fm = { ...draft.frontmatter };
    if (remove) {
      if (fm.planner_type !== 'entry') throw new Error('This note is no longer a planner entry.');
      delete fm.planner_type;
    } else {
      if (thread !== draft.originalThread && thread && !this.rows().some(row => row.path === thread)) throw new Error('The selected thread changed or was removed. Reopen this note.');
      const fields = admissionFields(fm, this.settings.propertyNames, date, thread === draft.originalThread ? undefined : this.threadValue(thread));
      Object.assign(fm, fields);
    }
    const changed = Object.keys(draft.frontmatter).length !== Object.keys(fm).length || Object.keys(fm).some(key => fm[key] !== draft.frontmatter[key]);
    await this.history.commit([{ path: draft.path, before: draft.text, after: changed ? pack(fm, draft.body) : draft.text }]);
    this.refresh();
    new Notice(remove ? 'Removed from planner. The note, date, thread and connections are kept. Undo is available in the planner.' : 'Note added to planner. Its file stays in the same folder. Undo is available in the planner.');
    if (!remove) await this.showEntry(draft.path);
  }

  async showEntry(path: string): Promise<void> {
    const entry = this.entries.get(path);
    if (!entry) throw new Error('This entry needs a valid date in the configured Date property.');
    await this.openPlanner();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof PlannerView) leaf.view.revealEntry(entry);
  }

  droppedNote(data: DataTransfer): TFile | null {
    const path = parseNoteDrop(data.getData('text/plain'), data.getData('text/uri-list'), this.app.vault.getName());
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path) ?? this.app.vault.getAbstractFileByPath(path + '.md') ?? this.app.metadataCache.getFirstLinkpathDest(path, '');
    return file instanceof TFile && file.extension === 'md' ? file : null;
  }

  async perform(action: () => Promise<unknown>): Promise<void> {
    try { await action(); }
    catch (error) { console.error('Just Simple Planner:', error); new Notice(error instanceof Error ? error.message : String(error), 9000); }
    finally { this.refresh(); }
  }

  async patch(patches: { path: string; fields?: Record<string, unknown>; body?: string; expectedText?: string; expectedBody?: string; expectedDate?: string }[]): Promise<void> {
    this.assertCanWrite();
    const generation = this.indexGeneration;
    const changes: Change[] = [];
    for (const patch of patches) {
      const before = await this.app.vault.read(this.file(patch.path));
      if (patch.expectedText !== undefined && before !== patch.expectedText) throw new Error('The note was edited elsewhere. Reopen it before saving.');
      const document = unpack(before);
      if (patch.expectedBody !== undefined && document.body !== patch.expectedBody) throw new Error('The note was edited elsewhere. Reopen it before saving.');
      const entry = document.frontmatter.planner_type !== 'thread';
      const editsEntry = patch.body !== undefined || ['date', 'title', 'thread', 'next'].some(key => key in (patch.fields ?? {}));
      if (entry && editsEntry && !isEntryFrontmatter(document.frontmatter)) throw new Error('This note is no longer marked as a planner entry.');
      if (patch.expectedDate !== undefined && document.frontmatter[entry ? this.settings.propertyNames.date : 'date'] !== patch.expectedDate) throw new Error('A date changed while dragging. Try again.');
      const fields = entry ? mapEntryFields(patch.fields ?? {}, this.settings.propertyNames) : patch.fields ?? {};
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) delete document.frontmatter[key]; else document.frontmatter[key] = value;
      }
      changes.push({ path: patch.path, before, after: pack(document.frontmatter, patch.body ?? document.body) });
    }
    if (generation !== this.indexGeneration) throw new Error('Property mapping changed while editing. Reopen the entry and try again.');
    await this.history.commit(changes);
  }

  async connect(source: string, target: string, remove = false): Promise<void> {
    if (source === target) return;
    if (!remove && (!this.entries.has(source) || !this.entries.has(target))) throw new Error('An entry changed or was removed. Reopen the planner and try again.');
    await this.writeConnection(source, target, remove);
  }

  private async writeConnection(source: string, target: string, remove = false): Promise<void> {
    this.assertCanWrite();
    const generation = this.indexGeneration;
    const before = await this.app.vault.read(this.file(source));
    if (generation !== this.indexGeneration) throw new Error('Property mapping changed while connecting. Try again.');
    const document = unpack(before);
    if (!isEntryFrontmatter(document.frontmatter)) throw new Error('The source note is no longer marked as a planner entry.');
    const value = document.frontmatter[this.settings.propertyNames.next];
    const links: string[] = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    const exists = links.some(link => this.resolveLink(link, source) === target);
    if ((!remove && exists) || (remove && !exists)) return;
    const next = links.filter(link => this.resolveLink(link, source) !== target);
    if (!remove) next.push(this.link(target));
    await this.patch([{ path: source, expectedText: before, fields: { next } }]);
  }

  async toggleEntryTask(entry: Entry, line: number, checked: boolean): Promise<void> {
    await this.patch([{ path: entry.path, expectedText: entry.snapshot, expectedBody: entry.body, body: toggleTask(entry.body, line, checked) }]);
  }

  async uniquePath(folder: string, title: string): Promise<string> {
    const normalized = normalizePath(cleanFolder(folder));
    if (normalized) {
      let current = '';
      for (const part of normalized.split('/').filter(Boolean)) {
        current = current ? `${current}/${part}` : part;
        if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
      }
    }
    const safe = title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 120) || 'Nueva entrada';
    const prefix = normalized ? `${normalized}/` : '';
    let path = normalizePath(`${prefix}${safe}.md`);
    for (let index = 2; this.app.vault.getAbstractFileByPath(path); index++) path = normalizePath(`${prefix}${safe} ${index}.md`);
    return path;
  }

  async createEntry(title: string, date: string, thread: string, body: string, previous?: string): Promise<void> {
    this.assertCanWrite();
    const settings = this.settings;
    if (!validDay(date)) throw new Error('Choose a valid date.');
    const path = await this.uniquePath(creationFolder(settings, 'entry'), `${date} - ${title}`);
    this.assertCanWrite();
    if (settings !== this.settings) throw new Error('Settings changed while creating the entry. Try again.');
    const fm: Record<string, unknown> = { planner_type: 'entry', ...mapEntryFields({ title, date, thread: thread && thread !== 'unassigned' ? thread.startsWith('text:') ? thread.slice(5) : this.link(thread) : '', next: [] }, settings.propertyNames) };
    const text = pack(fm, body);
    const file = await this.app.vault.create(path, text);
    this.indexText(file, text);
    if (previous) {
      try { await this.writeConnection(previous, path); }
      catch (error) { new Notice(`Entry saved, but its connection could not be added: ${error instanceof Error ? error.message : String(error)}`, 9000); }
    }
  }

  async createThread(title: string, color: string, status: string): Promise<void> {
    this.assertCanWrite();
    const settings = this.settings;
    const path = await this.uniquePath(creationFolder(settings, 'thread'), title);
    this.assertCanWrite();
    if (settings !== this.settings) throw new Error('Settings changed while creating the thread. Try again.');
    const text = pack({ planner_type: 'thread', status, color, order: this.threads.size }, `# ${title}\n\n`);
    const file = await this.app.vault.create(path, text);
    this.indexText(file, text);
  }
}
