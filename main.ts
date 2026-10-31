import { Plugin, Notice, TFile, TFolder, normalizePath, getFrontMatterInfo, parseYaml, stringifyYaml, type TAbstractFile } from 'obsidian';
import { History, today, validDay, wikiTarget, toggleTask, isEntryFrontmatter, isPlannerFrontmatter, type Entry, type Thread, type Change } from './model';
import { PlannerView, VIEW_TYPE, PLANNER_ICON } from './view';
import { EntryModal, ThreadModal } from './modals';
import { defaultSettings, loadSettings, validateSettings, cleanFolder, pathInScope, folderIntersectsScope, readEntryProperties, mapEntryFields, changesIndex, creationFolder, legacyDestinationsChanged, type PlannerSettings } from './settings';
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
    if (legacyDestinationsChanged(saved, this.settings)) new Notice('New note folders are now relative to the planner folder. Review the resolved destinations in settings. Existing notes were not moved.', 12000);
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
    this.settingsTab = new PlannerSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.registerEvent(this.app.metadataCache.on('changed', (file, text) => {
      if (!this.inScope(file.path)) { if (this.isKnown(file.path)) { this.forget(file.path); this.scheduleRefresh(); } return; }
      if (!this.isKnown(file.path) && !this.hasPlannerMetadata(file)) return;
      this.indexText(file, text); this.scheduleRefresh();
    }));
    this.registerEvent(this.app.metadataCache.on('resolved', () => { void this.perform(() => this.reloadIndex()); }));
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

  inScope(path: string): boolean { return pathInScope(path, this.settings); }

  configurationIssue(): string | null {
    try { validateSettings(this.settings); } catch (error) { return error instanceof Error ? error.message : String(error); }
    if (this.folderIsFile(this.settings.plannerFolder)) return 'Planner folder must be a folder path inside this vault.';
    return null;
  }

  async applySettings(candidate: PlannerSettings): Promise<void> {
    if (this.applyingSettings || this.history.busy) throw new Error('Wait for the current planner change to finish before applying settings.');
    const next = validateSettings(candidate);
    for (const path of [next.plannerFolder, creationFolder(next, 'entry'), creationFolder(next, 'thread')]) if (this.folderIsFile(path)) throw new Error('A folder path points to a file. Choose a folder inside this vault.');
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
    const previous = oldPaths.map(path => this.app.vault.getAbstractFileByPath(normalizePath(`${file.path}${path.slice(oldPath.length)}`))).filter((item): item is TFile => item instanceof TFile && this.inScope(item.path));
    const discovered = file instanceof TFile ? this.inScope(file.path) && (oldPaths.length || this.hasPlannerMetadata(file, oldPath)) ? [file] : [] : file instanceof TFolder ? this.plannerFilesInFolder(file, oldPath) : [];
    const destinations = new Set([...previous, ...discovered]);
    for (const destination of destinations) {
      if (this.stopping) return;
      const generation = this.indexGeneration;
      const path = destination.path;
      const revision = this.indexRevisions.get(path);
      const text = await this.readIndexText(destination);
      if (text !== null && generation === this.indexGeneration && destination.path === path && this.indexRevisions.get(path) === revision && this.inScope(path)) this.indexText(destination, text);
    }
    if (oldPaths.length || destinations.size) await this.reloadIndex();
  }

  private plannerFilesInFolder(folder: TFolder, oldPath?: string): TFile[] {
    if (!folderIntersectsScope(folder.path, this.settings)) return [];
    const result: TFile[] = [];
    for (const child of folder.children) {
      const previousPath = oldPath ? `${oldPath}/${child.name}` : undefined;
      if (child instanceof TFolder) result.push(...this.plannerFilesInFolder(child, previousPath));
      else if (child instanceof TFile && this.inScope(child.path) && this.hasPlannerMetadata(child, previousPath)) result.push(child);
    }
    return result;
  }

  private discoverPlannerPaths(): Set<string> {
    if (!this.settings.plannerFolder) return new Set(this.app.vault.getMarkdownFiles().filter(file => this.isKnown(file.path) || this.hasPlannerMetadata(file)).map(file => file.path));
    const folder = this.app.vault.getAbstractFileByPath(this.settings.plannerFolder);
    return new Set(folder instanceof TFolder ? this.plannerFilesInFolder(folder).map(file => file.path) : []);
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
    if (file.extension !== 'md' || !this.inScope(file.path)) return;
    try {
      const { frontmatter: fm, body } = unpack(text);
      if (fm.planner_type === 'thread') {
        this.threads.set(file.path, { path: file.path, title: file.basename, status: fm.status === 'parked' || fm.status === 'closed' ? fm.status : 'active', color: typeof fm.color === 'string' ? fm.color : 'blue', order: typeof fm.order === 'number' ? fm.order : 0 });
      } else if (isEntryFrontmatter(fm)) {
        const props = readEntryProperties(fm, this.settings.propertyNames);
        if (!validDay(props.date)) { this.invalid.add(file.path); return; }
        const thread = this.resolveLink(props.thread, file.path) ?? (typeof props.thread === 'string' && !wikiTarget(props.thread) ? `text:${props.thread}` : 'unassigned');
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
      // Whole-vault discovery is optional; folder mode walks only the selected subtree.
      const paths = this.indexDiscovered ? this.knownPaths() : this.discoverPlannerPaths();
      this.indexDiscovered = true;
      for (const path of paths) {
        if (this.stopping) return;
        if (generation !== this.indexGeneration) { this.indexPending = true; break; }
        if (!this.inScope(path)) { this.forget(path); continue; }
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
    if (generation !== this.indexGeneration) throw new Error('Scope or property mapping changed while editing. Reopen the entry and try again.');
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
    if (generation !== this.indexGeneration) throw new Error('Scope or property mapping changed while connecting. Try again.');
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
    if (!this.inScope(path)) new Notice('Entry saved outside the current planner folder. Update the folder in settings to see it on the board.', 9000);
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
    if (!this.inScope(path)) new Notice('Thread saved outside the current planner folder. Update the folder in settings to see it on the board.', 9000);
  }
}
