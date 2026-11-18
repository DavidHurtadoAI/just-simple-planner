import { ItemView, Setting, type WorkspaceLeaf } from 'obsidian';
import type JustSimplePlanner from './main';
import { VIEW_TYPE, PLANNER_ICON } from './view';

/** Workspace compatibility only: no timeline, index or note-writing controller. */
export class LegacyPlannerRedirect extends ItemView {
  private savedState: Record<string, unknown> = {};
  constructor(leaf: WorkspaceLeaf, private readonly plugin: JustSimplePlanner) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Planner migration'; }
  getIcon(): string { return PLANNER_ICON; }
  onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: 'Plan in Bases' });
    this.contentEl.createEl('p', { text: 'The classic planner has been retired. Open a Simple Planner Base or review migration from your existing notes. Your Markdown notes and saved settings are kept.' });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText('Open planner').onClick(() => { void this.plugin.perform(() => this.plugin.openPlanner()); }))
      .addButton(button => button.setButtonText('Review migration').setCta().onClick(() => this.plugin.openMigration()));
    return Promise.resolve();
  }
  getState(): Record<string, unknown> { return this.savedState; }
  setState(state: Record<string, unknown>): Promise<void> { this.savedState = state; return Promise.resolve(); }
}
