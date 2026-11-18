import { Plugin, Notice, TFile, FileView, SuggestModal, parseYaml, type App } from 'obsidian';
import { today } from './model';
import { defaultSettings, loadSettings, validateSettings, mergeSavedSettings, type PlannerSettings } from './settings';
import { PlannerSettingsTab } from './settings-tab';
import { BASES_VIEW_TYPE } from './base-model';
import { BasesPlannerView, plannerBasesOptions } from './bases';
import { MigrationModal, createMigratedBase } from './migration';
import { LegacyPlannerRedirect } from './legacy-view';
import { VIEW_TYPE, PLANNER_ICON } from './view';
import { ThreadModal } from './modals';
export type { PlannerSettings } from './settings';

export default class JustSimplePlanner extends Plugin {
  settings: PlannerSettings = defaultSettings();
  basesAvailable = false;
  private savedSettings: Record<string, unknown> = {};
  private applyingSettings = false;
  private settingsTab: PlannerSettingsTab | null = null;
  private migrationModal: MigrationModal | null = null;
  private planners = new Set<BasesPlannerView>();

  async onload(): Promise<void> {
    const saved: unknown = await this.loadData();
    this.savedSettings = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as Record<string, unknown> : {};
    this.settings = loadSettings(saved);
    // Kept only to restore old workspace tabs to a migration page, never a board.
    this.registerView(VIEW_TYPE, leaf => new LegacyPlannerRedirect(leaf, this));
    this.basesAvailable = this.registerBasesView(BASES_VIEW_TYPE, {
      name: 'Simple Planner', icon: PLANNER_ICON,
      factory: (controller, containerEl) => {
        const view = new BasesPlannerView(controller, containerEl);
        this.planners.add(view);
        view.register(() => this.planners.delete(view));
        return view;
      },
      options: config => plannerBasesOptions(config),
    });
    this.registerHoverLinkSource(VIEW_TYPE, { display: 'Just Simple Planner', defaultMod: false });
    this.addRibbonIcon(PLANNER_ICON, 'Open Just Simple Planner', () => { void this.perform(() => this.openPlanner()); });
    this.addCommand({ id: 'open-planner', name: 'Open planner', callback: () => { void this.perform(() => this.openPlanner()); } });
    this.addCommand({ id: 'create-bases-planner', name: 'Create Bases planner from classic notes', callback: () => this.openMigration() });
    this.addCommand({ id: 'new-entry', name: 'New entry in a Bases planner', callback: () => { void this.perform(() => this.openPlanner(view => view.session.newEntry(today()))); } });
    this.addCommand({ id: 'new-thread', name: 'New thread in a Bases planner', callback: () => { void this.perform(() => this.openPlanner(view => new ThreadModal(this.app, view.session).open())); } });
    this.addCommand({ id: 'add-active-note', name: 'Add active note to a Bases planner', checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== 'md') return false;
      if (!checking) void this.perform(() => this.openPlanner(view => view.session.reviewNote(file)));
      return true;
    } });
    this.addCommand({ id: 'remove-active-note', name: 'Remove active note from a Bases planner', checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file || this.app.metadataCache.getFileCache(file)?.frontmatter?.planner_type !== 'entry') return false;
      if (!checking) void this.perform(() => this.openPlanner(view => view.session.reviewNote(file, { remove: true })));
      return true;
    } });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile) || file.extension !== 'md') return;
      const type: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.planner_type;
      if (type === 'thread') return;
      menu.addSeparator();
      if (type === 'entry') menu.addItem(item => item.setTitle('Show in planner…').setIcon(PLANNER_ICON).onClick(() => { void this.perform(() => this.openPlanner(view => {
        const entry = view.session.entries.get(file.path);
        if (entry) view.surface.revealEntry(entry); else new Notice('This note is outside the selected Base. Review its filters and date property.');
      })); }));
      else menu.addItem(item => item.setTitle('Add note to planner…').setIcon(PLANNER_ICON).onClick(() => { void this.perform(() => this.openPlanner(view => view.session.reviewNote(file))); }));
      if (type === 'entry') menu.addItem(item => item.setTitle('Remove note from planner…').setIcon('minus-circle').onClick(() => { void this.perform(() => this.openPlanner(view => view.session.reviewNote(file, { remove: true }))); }));
    }));
    this.settingsTab = new PlannerSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.register(() => { this.migrationModal?.close(); this.planners.clear(); });
  }

  file(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error('The note was moved or removed: ' + path);
    return file;
  }

  async applySettings(candidate: PlannerSettings): Promise<void> {
    if (this.applyingSettings) throw new Error('Wait for the current settings change to finish.');
    const next = validateSettings(candidate);
    this.applyingSettings = true;
    try {
      // Preserve unknown fields too. Remove the old parent path after flattening it
      // so loading the saved settings again never prefixes the destinations twice.
      const saved = mergeSavedSettings(this.savedSettings, next);
      await this.saveData(saved);
      this.savedSettings = saved;
      this.settings = next;
    } finally { this.applyingSettings = false; }
    this.settingsTab?.synchronize();
  }

  legacyViewState(): Record<string, unknown> {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view.getState() ?? {};
  }

  openMigration(): void {
    this.migrationModal?.close();
    this.migrationModal = new MigrationModal(this.app, this);
    this.migrationModal.open();
  }

  async createBasesPlanner(path: string): Promise<TFile> { return createMigratedBase(this, path); }

  private activePlanner(): BasesPlannerView | undefined {
    const leaf = this.app.workspace.getMostRecentLeaf();
    return [...this.planners].find(view => view.parentEl.isConnected && leaf?.view.containerEl.contains(view.parentEl));
  }

  private async plannerFiles(): Promise<TFile[]> {
    const files: TFile[] = [];
    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== 'base') continue;
      try {
        const value: unknown = parseYaml(await this.app.vault.cachedRead(file));
        if (value && typeof value === 'object' && 'views' in value && Array.isArray(value.views) &&
          value.views.some((view: unknown) => view && typeof view === 'object' && 'type' in view && view.type === BASES_VIEW_TYPE)) files.push(file);
      } catch { /* A malformed or unrelated Base is not an available planner. */ }
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  async openPlanner(action?: (view: BasesPlannerView) => unknown): Promise<void> {
    if (!this.basesAvailable) { new Notice('Enable the built-in Bases plugin, then reload Just Simple Planner. Your notes and migration settings are kept.'); return; }
    const active = this.activePlanner();
    if (active) { await action?.(active); return; }
    const files = await this.plannerFiles();
    if (!files.length) { this.openMigration(); return; }
    const open = async (file: TFile): Promise<void> => {
      const leaf = this.app.workspace.getLeavesOfType('bases').find(item => item.view instanceof FileView && item.view.file?.path === file.path) ?? this.app.workspace.getLeaf('tab');
      await leaf.openFile(file);
      await this.app.workspace.revealLeaf(leaf);
      if (!action) return;
      for (let attempt = 0; attempt < 100; attempt++) {
        const view = this.activePlanner();
        if (view && view.session.editGeneration > 0) { await action(view); return; }
        await new Promise<void>(resolve => window.setTimeout(resolve, 30));
      }
      new Notice('Choose the Simple Planner layout in this Base, then run the command again.');
    };
    if (files.length === 1) await open(files[0]);
    else {
      const picker = new class extends SuggestModal<TFile | null> {
        constructor(app: App, private readonly choose: (file: TFile | null) => void) { super(app); }
        getSuggestions(query: string): (TFile | null)[] { return [...files.filter(file => file.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())), null]; }
        renderSuggestion(file: TFile | null, el: HTMLElement): void { el.setText(file?.path ?? 'Create Bases planner from classic notes…'); }
        onChooseSuggestion(file: TFile | null): void { this.choose(file); }
      }(this.app, file => { if (file) void this.perform(() => open(file)); else this.openMigration(); });
      picker.setPlaceholder('Choose a planner Base');
      picker.open();
    }
  }

  async perform(action: () => Promise<unknown>): Promise<void> {
    try { await action(); }
    catch (error) { new Notice(error instanceof Error ? error.message : String(error), 9000); }
  }
}
