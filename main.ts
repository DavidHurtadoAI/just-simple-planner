import { Plugin, PluginSettingTab, Setting, Notice, TFile, normalizePath, getFrontMatterInfo, parseYaml, stringifyYaml, type App, type SettingDefinitionItem, type TAbstractFile } from 'obsidian';
import { History, today, validDay, wikiTarget, toggleTask, type Entry, type Thread, type Change } from './model';
import { PlannerView, VIEW_TYPE, PLANNER_ICON } from './view';
import { EntryModal, ThreadModal } from './modals';

export interface PlannerSettings { entryFolder: string; threadFolder: string; dayWidth: number }
const DEFAULTS: PlannerSettings = { entryFolder: 'Planificador/Entradas', threadFolder: 'Planificador/Hilos', dayWidth: 190 };

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
  settings: PlannerSettings = { ...DEFAULTS };
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

  async onload(): Promise<void> {
    const saved: unknown = await this.loadData();
    if (saved && typeof saved === 'object') {
      const values = saved as Partial<PlannerSettings>;
      if (typeof values.entryFolder === 'string') this.settings.entryFolder = values.entryFolder;
      if (typeof values.threadFolder === 'string') this.settings.threadFolder = values.threadFolder;
      if ([140, 190, 250].includes(values.dayWidth ?? 0)) this.settings.dayWidth = values.dayWidth!;
    }
    this.history = new History({ write: async (path, expected, replacement) => {
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
    this.addSettingTab(new PlannerSettingsTab(this.app, this));
    this.registerEvent(this.app.metadataCache.on('changed', (file, text) => {
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

  private knownPaths(): Set<string> { return new Set([...this.entries.keys(), ...this.threads.keys(), ...this.invalid]); }

  private isKnown(path: string): boolean { return this.entries.has(path) || this.threads.has(path) || this.invalid.has(path); }

  private hasPlannerMetadata(file: TFile): boolean {
    const type: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.planner_type;
    return file.extension === 'md' && (type === 'entry' || type === 'thread');
  }

  private forget(path: string): void {
    this.indexRevisions.set(path, (this.indexRevisions.get(path) ?? 0) + 1);
    this.entries.delete(path); this.threads.delete(path); this.invalid.delete(path);
  }

  private async reindexRenamed(file: TAbstractFile, oldPath: string): Promise<void> {
    const moved = file instanceof TFile
      ? this.isKnown(oldPath) || this.hasPlannerMetadata(file) ? [oldPath] : []
      : [...this.knownPaths()].filter(path => path.startsWith(`${oldPath}/`));
    for (const path of moved) {
      this.forget(path);
      const destination = this.app.vault.getAbstractFileByPath(normalizePath(`${file.path}${path.slice(oldPath.length)}`));
      if (destination instanceof TFile && !this.stopping) this.indexText(destination, await this.app.vault.read(destination));
    }
    if (moved.length) await this.reloadIndex();
  }

  indexText(file: TFile, text: string): void {
    this.forget(file.path);
    if (file.extension !== 'md') return;
    try {
      const { frontmatter: fm, body } = unpack(text);
      if (fm.planner_type === 'thread') {
        this.threads.set(file.path, { path: file.path, title: file.basename, status: fm.status === 'parked' || fm.status === 'closed' ? fm.status : 'active', color: typeof fm.color === 'string' ? fm.color : 'blue', order: typeof fm.order === 'number' ? fm.order : 0 });
      } else if (fm.planner_type === 'entry') {
        if (!validDay(fm.date)) { this.invalid.add(file.path); return; }
        const thread = this.resolveLink(fm.thread, file.path) ?? (typeof fm.thread === 'string' && !wikiTarget(fm.thread) ? `text:${fm.thread}` : 'unassigned');
        const next = Array.isArray(fm.next) ? fm.next.map(item => this.resolveLink(item, file.path)).filter((path): path is string => path !== null && path !== file.path) : [];
        this.entries.set(file.path, { path: file.path, title: typeof fm.title === 'string' && fm.title.trim() ? fm.title : file.basename.replace(/^\d{4}-\d{2}-\d{2} - /, ''), date: fm.date, thread, next: [...new Set(next)], body, snapshot: text });
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
      // Discovery needs Markdown paths across the vault because folders do not define membership.
      // Only explicitly marked notes are read; later passes revisit known planner paths only.
      const paths = this.indexDiscovered ? this.knownPaths() : new Set(this.app.vault.getMarkdownFiles().filter(file => this.isKnown(file.path) || this.hasPlannerMetadata(file)).map(file => file.path));
      this.indexDiscovered = true;
      for (const path of paths) {
        if (this.stopping) return;
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) { this.forget(path); continue; }
        const revision = this.indexRevisions.get(path);
        const text = await this.app.vault.cachedRead(file);
        // A metadata event or rename may have supplied a newer snapshot while reading.
        if (!this.stopping && file.path === path && this.indexRevisions.get(path) === revision) this.indexText(file, text);
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
    const changes: Change[] = [];
    for (const patch of patches) {
      const before = await this.app.vault.read(this.file(patch.path));
      if (patch.expectedText !== undefined && before !== patch.expectedText) throw new Error('The note was edited elsewhere. Reopen it before saving.');
      const document = unpack(before);
      if (patch.expectedBody !== undefined && document.body !== patch.expectedBody) throw new Error('The note was edited elsewhere. Reopen it before saving.');
      if (patch.expectedDate !== undefined && document.frontmatter.date !== patch.expectedDate) throw new Error('A date changed while dragging. Try again.');
      for (const [key, value] of Object.entries(patch.fields ?? {})) {
        if (value === undefined) delete document.frontmatter[key]; else document.frontmatter[key] = value;
      }
      changes.push({ path: patch.path, before, after: pack(document.frontmatter, patch.body ?? document.body) });
    }
    await this.history.commit(changes);
  }

  async connect(source: string, target: string, remove = false): Promise<void> {
    if (source === target) return;
    if (!remove && (!this.entries.has(source) || !this.entries.has(target))) throw new Error('An entry changed or was removed. Reopen the planner and try again.');
    const before = await this.app.vault.read(this.file(source));
    const document = unpack(before);
    const links: string[] = Array.isArray(document.frontmatter.next) ? document.frontmatter.next.filter((value): value is string => typeof value === 'string') : [];
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
    const normalized = normalizePath(folder.trim());
    if (normalized.split('/').some(part => part === '..' || part === '.') || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) throw new Error('Choose a folder inside the vault.');
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
    if (!validDay(date)) throw new Error('Choose a valid date.');
    const path = await this.uniquePath(this.settings.entryFolder, `${date} - ${title}`);
    const fm: Record<string, unknown> = { planner_type: 'entry', title, date, thread: thread && thread !== 'unassigned' ? thread.startsWith('text:') ? thread.slice(5) : this.link(thread) : '', next: [] };
    const file = await this.app.vault.create(path, pack(fm, body));
    this.indexText(file, await this.app.vault.read(file));
    if (previous) {
      try { await this.connect(previous, path); }
      catch (error) { new Notice(`Entry saved, but its connection could not be added: ${error instanceof Error ? error.message : String(error)}`, 9000); }
    }
  }

  async createThread(title: string, color: string, status: string): Promise<void> {
    const path = await this.uniquePath(this.settings.threadFolder, title);
    const text = pack({ planner_type: 'thread', status, color, order: this.threads.size }, `# ${title}\n\n`);
    const file = await this.app.vault.create(path, text);
    this.indexText(file, text);
  }
}

class PlannerSettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: JustSimplePlanner) { super(app, plugin); }

  getSettingDefinitions(): SettingDefinitionItem[] { return this.definitions(); }

  private definitions(): ({ name: string; desc: string; render: (setting: Setting) => void } | { name: string; desc: string; render?: never })[] {
    return [
      {
        name: 'New entries folder', desc: 'Storage only. Moving a note never changes its thread.',
        render: setting => { setting.addText(text => text.setValue(this.plugin.settings.entryFolder).onChange(async value => { this.plugin.settings.entryFolder = value; await this.plugin.saveData(this.plugin.settings); })); },
      },
      {
        name: 'New threads folder', desc: 'Thread notes hold status, color and order.',
        render: setting => { setting.addText(text => text.setValue(this.plugin.settings.threadFolder).onChange(async value => { this.plugin.settings.threadFolder = value; await this.plugin.saveData(this.plugin.settings); })); },
      },
      {
        name: 'Day width', desc: 'Default spacing between dates on the board.',
        render: setting => { setting.addDropdown(dropdown => dropdown.addOptions({ '140': 'Compact', '190': 'Comfortable', '250': 'Wide' }).setValue(String(this.plugin.settings.dayWidth)).onChange(async value => { this.plugin.settings.dayWidth = Number(value); await this.plugin.saveData(this.plugin.settings); this.plugin.refresh(); })); },
      },
      {
        name: 'Local Markdown notes',
        desc: 'Notes are the source of truth. Properties: planner_type, title, date, thread, next; thread notes also use status, color and order. Pending tasks use their entry date. No background reminders or network requests.',
      },
    ];
  }

  // Obsidian before 1.13 renders settings through this fallback.
  display(): void {
    this.containerEl.empty();
    for (const definition of this.definitions()) {
      const setting = new Setting(this.containerEl).setName(definition.name).setDesc(definition.desc);
      definition.render?.(setting);
    }
  }
}
