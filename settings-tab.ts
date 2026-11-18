import { PluginSettingTab, Setting, type App, type SettingDefinitionItem } from 'obsidian';
import type JustSimplePlanner from './main';
import { cloneSettings, creationFolder, DEFAULT_PROPERTIES, ENTRY_PROPERTIES, type PlannerSettings, type EntryProperty } from './settings';

type FieldKey = Exclude<keyof PlannerSettings, 'propertyNames'> | EntryProperty;
type TextKey = Exclude<FieldKey, 'dayWidth'>;
type FieldValue = string | number;
interface Field {
  key: FieldKey;
  input: HTMLElement;
  feedback: HTMLElement;
  get: () => FieldValue;
  set: (value: FieldValue) => void;
  dirty: boolean;
  revision: number;
  queued: number | null;
}
interface SettingRow { name: string; desc: string; render?: (setting: Setting) => void }
interface SettingSection { heading: string; rows: SettingRow[] }

export class PlannerSettingsTab extends PluginSettingTab {
  private fields = new Map<FieldKey, Field>();
  private queue: Promise<void> = Promise.resolve();
  private saving = 0;
  private serial = 0;
  private synchronizing = 0;
  private destinations: Setting | null = null;

  constructor(app: App, private readonly plugin: JustSimplePlanner) { super(app, plugin); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    this.fields.clear();
    return this.sections().map(section => ({ type: 'group', heading: section.heading, items: section.rows.map(row => row.render ? { name: row.name, desc: row.desc, render: row.render } : { name: row.name, desc: row.desc }) }));
  }

  // Saving one field must not remove focus or another unfinished edit.
  synchronize(): void {
    for (const field of this.fields.values()) if (!field.dirty) field.set(this.value(this.plugin.settings, field.key));
    this.destinations?.setDesc(this.destinationDescription());
  }

  hide(): void {
    for (const field of this.fields.values()) if (field.dirty) this.save(field);
    super.hide();
  }

  private value(settings: PlannerSettings, key: FieldKey): FieldValue {
    return ENTRY_PROPERTIES.includes(key as EntryProperty) ? settings.propertyNames[key as EntryProperty] : settings[key as Exclude<keyof PlannerSettings, 'propertyNames'>];
  }

  private assign(settings: PlannerSettings, key: FieldKey, value: FieldValue): void {
    if (key === 'dayWidth') settings.dayWidth = Number(value);
    else if (ENTRY_PROPERTIES.includes(key as EntryProperty)) settings.propertyNames[key as EntryProperty] = String(value);
    else settings[key as 'entryFolder' | 'threadFolder'] = String(value);
  }

  private track(key: FieldKey, setting: Setting, input: HTMLElement, get: Field['get'], set: Field['set']): Field {
    const id = `jsp-setting-${key}-${++this.serial}`;
    const feedback = setting.infoEl.createDiv({ cls: 'jsp-setting-feedback', attr: { id, role: 'status', 'aria-live': 'polite' } });
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
    const field: Field = { key, input, feedback, get, set: value => {
      this.synchronizing++;
      try { set(value); } finally { this.synchronizing--; }
    }, dirty: false, revision: 0, queued: null };
    this.fields.set(key, field); field.set(this.value(this.plugin.settings, key));
    return field;
  }

  private feedback(field: Field, message: string, invalid = false): void {
    field.feedback.setText(message);
    field.feedback.toggleClass('is-error', invalid);
    field.input.setAttribute('aria-invalid', String(invalid));
  }

  private edit(field: Field): void {
    field.dirty = true; field.revision++;
    this.feedback(field, 'Press Enter or leave this field to save.');
  }

  private save(field: Field, changedValue?: FieldValue): void {
    if (!field.dirty || field.queued === field.revision) return;
    const revision = field.revision;
    const value = changedValue ?? field.get();
    field.queued = revision;
    this.saving++;
    this.feedback(field, 'Saving…');
    this.queue = this.queue.then(async () => {
      try {
        if (field.revision !== revision) return;
        // Merge completed edits into the latest saved settings; queued changes cannot overwrite each other.
        const candidate = cloneSettings(this.plugin.settings);
        this.assign(candidate, field.key, value);
        if (this.value(this.plugin.settings, field.key) !== value) await this.plugin.applySettings(candidate);
        if (field.revision === revision) {
          field.dirty = false; field.set(this.value(this.plugin.settings, field.key));
          this.feedback(field, 'Saved.');
        }
      } catch (error) {
        if (field.revision !== revision) return;
        const message = error instanceof Error ? error.message : String(error);
        const immediate = field.key === 'dayWidth';
        if (immediate) { field.dirty = false; field.set(this.value(this.plugin.settings, field.key)); }
        this.feedback(field, `${message} ${immediate ? 'The previous value is still active.' : 'Not saved; the previous value is still active.'}`, !immediate);
        field.feedback.toggleClass('is-error', true);
      } finally {
        if (field.queued === revision) field.queued = null;
        this.saving--;
      }
    });
  }

  private text(key: TextKey, name: string, desc: string, placeholder: string): SettingRow {
    return { name, desc, render: setting => {
      setting.addText(input => {
        input.setPlaceholder(placeholder);
        const field = this.track(key, setting, input.inputEl, () => input.getValue(), value => { input.setValue(String(value)); });
        input.onChange(() => { if (!this.synchronizing) this.edit(field); });
        input.inputEl.addEventListener('blur', () => this.save(field));
        input.inputEl.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); this.save(field); } });
      });
    } };
  }

  private sections(): SettingSection[] {
    const property = (key: EntryProperty, name: string, desc: string): SettingRow => this.text(key, name, `${desc}. Default: ${DEFAULT_PROPERTIES[key]}.`, DEFAULT_PROPERTIES[key]);
    return [
      { heading: 'Bases planners', rows: [
        { name: 'Plan in Bases', desc: 'Open a .base file and choose the Simple Planner layout. Each view has its own filters, property mapping, day width and native new-note destination. The classic board has been retired.' },
        { name: 'Open a planner', desc: 'Choose an existing Simple Planner Base.', render: setting => { setting.addButton(button => button.setButtonText('Open planner').onClick(() => { void this.plugin.perform(() => this.plugin.openPlanner()); })); } },
        { name: 'Migrate classic notes', desc: 'Review marked notes and create a new Base using the saved mapping below. Existing notes and saved settings are kept.', render: setting => { setting.addButton(button => button.setButtonText('Review migration').onClick(() => this.plugin.openMigration())); } },
      ] },
      { heading: 'Saved migration settings', rows: [
        { name: 'Used only when migrating', desc: 'These saved values are imported into newly migrated Bases. Editing them never changes an existing Base or rewrites a note. Configure existing planners in their Base instead.' },
        { name: 'Former creation destinations', desc: this.destinationDescription(), render: setting => { this.destinations = setting; setting.setDesc(this.destinationDescription()); } },
        this.text('entryFolder', 'Former entries folder', 'Saved migration information only. New notes use the native Bases creation destination.', 'Vault root'),
        this.text('threadFolder', 'Former threads folder', 'Saved migration information only. New notes use the native Bases creation destination.', 'Vault root'),
        property('date', 'Date property', 'Classic entry date in YYYY-MM-DD format'),
        property('title', 'Title property', 'Card title, with the filename as fallback'),
        property('thread', 'Thread property', 'A wikilink to a thread note or a plain-text group'),
        property('next', 'Connections property', 'A YAML list of wikilinks to following entries'),
        { name: 'Day width', desc: 'Imported into a newly migrated Base.', render: setting => { setting.addDropdown(dropdown => {
          dropdown.addOptions({ '140': 'Compact', '190': 'Comfortable', '250': 'Wide' });
          const field = this.track('dayWidth', setting, dropdown.selectEl, () => Number(dropdown.getValue()), value => { dropdown.setValue(String(value)); });
          dropdown.onChange(value => { if (!this.synchronizing) { this.edit(field); this.save(field, Number(value)); } });
        }); } },
      ] },
    ];
  }

  private destinationDescription(): string {
    try { return `Entries: ${creationFolder(this.plugin.settings, 'entry') || 'Vault root'}. Threads: ${creationFolder(this.plugin.settings, 'thread') || 'Vault root'}.`; }
    catch { return 'Correct the folder paths to see the destinations. Existing files are not moved.'; }
  }

  // Obsidian before 1.13 uses the same controls, validation and autosave handlers.
  display(): void {
    this.fields.clear(); this.containerEl.empty();
    for (const section of this.sections()) {
      new Setting(this.containerEl).setName(section.heading).setHeading();
      for (const row of section.rows) { const setting = new Setting(this.containerEl).setName(row.name).setDesc(row.desc); row.render?.(setting); }
    }
  }
}
