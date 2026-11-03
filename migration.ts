import { Modal, Notice, Setting, TFile, stringifyYaml, type App } from 'obsidian';
import type JustSimplePlanner from './main';
import { migrationDocument, plannerSignature } from './base-model';
import { cleanFolder, cloneSettings } from './settings';
import { VIEW_TYPE } from './view';

export class MigrationModal extends Modal {
  private busy = false;
  private preview = '';
  private path = 'Planner/Just Simple Planner.base';
  private details!: HTMLElement;
  private error!: HTMLElement;
  private createButton: HTMLButtonElement | null = null;
  constructor(app: App, private readonly plugin: JustSimplePlanner) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('jsp-migration-modal'); this.setTitle('Create Bases planner');
    this.contentEl.createEl('p', { text: 'The classic view is deprecated but remains available; no removal date is set. This creates a new Base that reads your existing entries and thread notes. It is the same plugin and the same Markdown notes. Your notes, folders, classic settings and old planner remain intact.' });
    this.contentEl.createEl('p', { text: 'Bases must be enabled. Its filters select the notes, and its native new action determines where new notes are created. Classic creation folders are kept for the classic view; they are not copied as search filters.' });
    new Setting(this.contentEl).setName('Base file path').setDesc('A new .base file inside this vault. An existing file will never be overwritten.').addText(input => input.setValue(this.path).onChange(value => { this.path = value; }));
    this.details = this.contentEl.createDiv({ cls: 'jsp-migration-details' });
    this.error = this.contentEl.createDiv({ cls: 'jsp-membership-error', attr: { role: 'alert' } });
    new Setting(this.contentEl).addButton(b => b.setButtonText('Refresh review').onClick(() => { void this.review(); })).addButton(b => b.setButtonText('Cancel').onClick(() => this.close())).addButton(b => {
      this.createButton = b.buttonEl;
      b.setButtonText('Create Base').setCta().setDisabled(true).onClick(() => { void this.create(); });
    });
    void this.review();
  }
  private async review(): Promise<void> {
    this.error.empty(); this.createButton?.setAttribute('disabled', '');
    try {
      if (!this.plugin.basesAvailable) throw new Error('Enable the built-in Bases plugin, then reload Just Simple Planner. The classic view remains available.');
      await this.plugin.reloadIndex();
      const issue = this.plugin.configurationIssue(); if (issue) throw new Error(issue);
      this.preview = plannerSignature(this.plugin.entries.values(), this.plugin.threads.values()) + JSON.stringify([...this.plugin.invalid].sort());
      this.details.empty();
      this.details.createEl('p', { text: `${this.plugin.entries.size} entries · ${this.plugin.threads.size} thread notes · ${[...this.plugin.entries.values()].reduce((n, e) => n + e.next.length, 0)} connections · ${this.plugin.invalid.size} invalid notes` });
      this.details.createEl('p', { text: `Property mapping: date = ${this.plugin.settings.propertyNames.date}, title = ${this.plugin.settings.propertyNames.title}, thread = ${this.plugin.settings.propertyNames.thread}, connections = ${this.plugin.settings.propertyNames.next}. Day width: ${this.plugin.settings.dayWidth}px.` });
      this.details.createEl('p', { text: `Classic creation destinations remain unchanged: entries in ${this.plugin.settings.entryFolder || 'the vault root'}, threads in ${this.plugin.settings.threadFolder || 'the vault root'}. The new Base uses native Bases creation behavior.` });
      this.details.createEl('p', { text: 'Empty thread rows are included explicitly. The new view checks its entries, thread properties and connection targets against this snapshot after loading. Invalid notes remain counted for review.' });
      this.createButton?.removeAttribute('disabled');
    } catch (error) { this.error.setText(error instanceof Error ? error.message : String(error)); }
  }
  private async create(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.createButton?.setAttribute('disabled', ''); this.error.empty();
    try {
      await this.plugin.reloadIndex();
      if (this.preview !== plannerSignature(this.plugin.entries.values(), this.plugin.threads.values()) + JSON.stringify([...this.plugin.invalid].sort())) throw new Error('The classic planner changed. Refresh the review before creating the Base.');
      const file = await createMigratedBase(this.plugin, this.path);
      await this.app.workspace.getLeaf('tab').openFile(file);
      this.close(); new Notice('Base created. Your classic planner and original notes are unchanged. Review the migration status in the new view.');
    } catch (error) { this.error.setText(error instanceof Error ? error.message : String(error)); }
    finally { this.busy = false; this.createButton?.removeAttribute('disabled'); }
  }
  onClose(): void { this.contentEl.empty(); this.plugin.classicViewClosed(); }
}

/** Additive migration: all writes are confined to a new Base and missing parent folders. */
export async function createMigratedBase(plugin: JustSimplePlanner, requestedPath: string): Promise<TFile> {
  if (!plugin.basesAvailable) throw new Error('Enable Bases and reload the plugin before migrating.');
  const path = cleanFolder(requestedPath);
  if (!path.endsWith('.base') || /[<>:"|?*]/.test(path) || [...path].some(char => char.charCodeAt(0) < 32)) throw new Error('Choose a valid vault-relative .base path.');
  if (plugin.app.vault.getAbstractFileByPath(path)) throw new Error('That Base file already exists. Choose another path.');
  await plugin.reloadIndex();
  const issue = plugin.configurationIssue(); if (issue) throw new Error(issue);
  const settings = cloneSettings(plugin.settings);
  const classic = plugin.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
  const document = migrationDocument(settings, plugin.entries.values(), plugin.threads.values(), plugin.invalid, classic?.getState() ?? {});
  let current = '';
  for (const part of path.split('/').slice(0, -1)) {
    current = current ? current + '/' + part : part;
    const existing = plugin.app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFile) throw new Error('A parent path points to a file.');
    if (!existing) await plugin.app.vault.createFolder(current);
  }
  try { return await plugin.app.vault.create(path, stringifyYaml(document)); }
  finally { plugin.classicViewClosed(); }
}
