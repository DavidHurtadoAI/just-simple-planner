import { Modal, Notice, Setting, TFile, stringifyYaml, type App, type ButtonComponent } from 'obsidian';
import type JustSimplePlanner from './main';
import { migrationDocument } from './base-model';
import { cleanFolder } from './settings';
import { readLegacyPlanner, type LegacySnapshot } from './legacy';

export class MigrationModal extends Modal {
  private busy = false;
  private revision = 0;
  private snapshot: LegacySnapshot | null = null;
  private path = 'Planner/Just Simple Planner.base';
  private details!: HTMLElement;
  private error!: HTMLElement;
  private createButton: ButtonComponent | null = null;
  constructor(app: App, private readonly plugin: JustSimplePlanner) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('jsp-migration-modal'); this.setTitle('Create Bases planner');
    this.contentEl.createEl('p', { text: 'The classic view has been retired. This creates a new Base from your existing marked entries and thread notes, using the saved classic property mapping and day width. Your notes, folders and saved settings are kept.' });
    this.contentEl.createEl('p', { text: 'Enable Bases first. Its filters select the notes, and native Bases creation chooses where new notes go. Former creation folders are retained as migration information, not used as query filters.' });
    new Setting(this.contentEl).setName('Base file path').setDesc('A new .base file inside this vault. An existing file will never be overwritten.').addText(input => input.setValue(this.path).onChange(value => { this.path = value; }));
    this.details = this.contentEl.createDiv({ cls: 'jsp-migration-details' });
    this.error = this.contentEl.createDiv({ cls: 'jsp-membership-error', attr: { role: 'alert' } });
    new Setting(this.contentEl).addButton(b => b.setButtonText('Refresh review').onClick(() => { if (!this.busy) void this.review(); })).addButton(b => b.setButtonText('Cancel').onClick(() => this.close())).addButton(b => {
      this.createButton = b;
      b.setButtonText('Create Base').setCta().setDisabled(true).onClick(() => { void this.create(); });
    });
    void this.review();
  }
  private async review(): Promise<void> {
    const revision = ++this.revision;
    this.snapshot = null; this.error.empty(); this.createButton?.setDisabled(true);
    try {
      if (!this.plugin.basesAvailable) throw new Error('Enable the built-in Bases plugin, then reload Just Simple Planner.');
      const snapshot = await readLegacyPlanner(this.app, this.plugin.settings);
      if (revision !== this.revision) return;
      this.snapshot = snapshot;
      this.details.empty();
      this.details.createEl('p', { text: snapshot.entries.size + ' entries · ' + snapshot.threads.size + ' thread notes · ' + [...snapshot.entries.values()].reduce((n, e) => n + e.next.length, 0) + ' connections · ' + snapshot.invalid.size + ' invalid notes' });
      const settings = snapshot.settings;
      this.details.createEl('p', { text: 'Saved property mapping: date = ' + settings.propertyNames.date + ', title = ' + settings.propertyNames.title + ', thread = ' + settings.propertyNames.thread + ', connections = ' + settings.propertyNames.next + '. Day width: ' + settings.dayWidth + 'px.' });
      this.details.createEl('p', { text: 'Former creation destinations: entries in ' + (settings.entryFolder || 'the vault root') + ', threads in ' + (settings.threadFolder || 'the vault root') + '. The new Base uses native Bases creation.' });
      this.details.createEl('p', { text: 'Empty thread rows are included explicitly. The new view compares its entries, thread properties and connection targets with this snapshot after loading. Review invalid notes before accepting migration.' });
      this.createButton?.setDisabled(false);
    } catch (error) { if (revision === this.revision) this.error.setText(error instanceof Error ? error.message : String(error)); }
  }
  private async create(): Promise<void> {
    if (this.busy || !this.snapshot) return;
    this.busy = true; this.createButton?.setDisabled(true); this.error.empty();
    try {
      const file = await createMigratedBase(this.plugin, this.path, this.snapshot.fingerprint);
      await this.app.workspace.getLeaf('tab').openFile(file);
      this.close(); new Notice('Base created. Original notes and saved settings are kept. Review the migration status in the new view.');
    } catch (error) { this.error.setText(error instanceof Error ? error.message : String(error)); }
    finally { this.busy = false; this.createButton?.setDisabled(!this.snapshot); }
  }
  onClose(): void { this.revision++; this.snapshot = null; this.contentEl.empty(); }
}

/** Additive migration: all writes are confined to a new Base and missing parents. */
export async function createMigratedBase(plugin: JustSimplePlanner, requestedPath: string, expectedFingerprint?: string): Promise<TFile> {
  if (!plugin.basesAvailable) throw new Error('Enable Bases and reload the plugin before migrating.');
  const path = cleanFolder(requestedPath);
  if (!path.endsWith('.base') || /[<>:"|?*]/.test(path) || [...path].some(char => char.charCodeAt(0) < 32)) throw new Error('Choose a valid vault-relative .base path.');
  if (plugin.app.vault.getAbstractFileByPath(path)) throw new Error('That Base file already exists. Choose another path.');
  const snapshot = await readLegacyPlanner(plugin.app, plugin.settings);
  if (expectedFingerprint !== undefined && snapshot.fingerprint !== expectedFingerprint) throw new Error('The classic notes or migration settings changed. Refresh the review before creating the Base.');
  const document = migrationDocument(snapshot.settings, snapshot.entries.values(), snapshot.threads.values(), snapshot.invalid, plugin.legacyViewState());
  let current = '';
  for (const part of path.split('/').slice(0, -1)) {
    current = current ? current + '/' + part : part;
    const existing = plugin.app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFile) throw new Error('A parent path points to a file.');
    if (!existing) await plugin.app.vault.createFolder(current);
  }
  return plugin.app.vault.create(path, stringifyYaml(document));
}
