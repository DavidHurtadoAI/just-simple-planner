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
      {
        heading: 'New note locations', rows: [
          { name: 'Saving settings', desc: 'Dropdowns save immediately. Text fields save when you press Enter or leave the field, including when you close settings. Invalid changes show an error beside the field; the last valid configuration stays active.' },
          { name: 'Folders are storage locations, not filters', desc: 'Marked entries and threads are found anywhere in this vault. These two paths only choose where newly created notes are saved. Existing notes stay in their current folders. The former Planner folder setting has been removed; older base and subfolder paths are combined to preserve their full creation destinations. No files are moved.' },
          this.text('threadFolder', 'Threads folder', 'Vault-relative folder for new thread notes, which store each row’s color, status and order. Default: Planner/Threads. Leave empty to create threads in the vault root. Changing this path does not hide or move existing threads.', 'Vault root'),
          this.text('entryFolder', 'New entries folder', 'Vault-relative destination for notes created with New entry. Default: Planner/Entries. Leave empty to create them in the vault root. Notes added from the file explorer keep their original location, regardless of this setting.', 'Vault root'),
          { name: 'Resolved new note folders', desc: this.destinationDescription(), render: setting => { this.destinations = setting; setting.setDesc(this.destinationDescription()); } },
        ],
      },
      {
        heading: 'Existing notes and membership', rows: [
          { name: 'Only marked planner notes appear', desc: 'Cards require planner_type: entry and a valid YYYY-MM-DD date in the configured Date property. Thread notes use planner_type: thread, including empty threads. A date alone never adds a note. The thread property chooses the row; missing values appear in Unassigned. Missing titles use the filename.' },
          { name: 'Add an existing note', desc: 'Right-click a Markdown note in the file explorer and choose Add note to planner. Or drag one note onto a thread header or notebook thread to keep its date; drop onto a day cell to propose that date. Review the exact property changes before saving. The original note stays in place and is not duplicated.' },
          { name: 'Calendar dates are shared', desc: 'Adding a note keeps its valid existing date unless you choose another. Changing the mapped Date property also changes calendars and other views that use it. The review highlights this before saving. The date must be a day in YYYY-MM-DD format, not a date and time.' },
          { name: 'Remove a note from the planner', desc: 'Use the file-explorer menu or the card’s menu. Removal deletes only planner_type: entry; it keeps the note, date, thread, connections and calendar properties. Undo and Redo in the planner also cover adding and removing notes. Nothing is sent outside this vault.' },
        ],
      },
      {
        heading: 'Property mapping', rows: [
          { name: 'Use your existing frontmatter names', desc: 'Enter four different, non-empty YAML property names. The planner uses these exact keys when reading, creating, editing, moving and connecting entries. planner_type stays fixed and is reserved.' },
          property('date', 'Date property', 'Calendar date in YYYY-MM-DD format. An entry must have a valid date under this key to appear'),
          property('title', 'Title property', 'Text shown on the card. When the property value is empty or missing, the filename is used'),
          property('thread', 'Thread property', 'A wikilink to a thread note, or a plain-text group name'),
          property('next', 'Connections property', 'A YAML list of wikilinks to following entries. This controls arrows and connected flows'),
          { name: 'Changing the mapping does not migrate notes', desc: 'Existing properties and files are not renamed or rewritten. Marked entries without a valid mapped date are counted as invalid. Session undo/redo is cleared when the property mapping changes. Thread-note properties status, color and order keep their names.' },
        ],
      },
      {
        heading: 'Display', rows: [
          { name: 'Day width', desc: 'Default spacing between dates on the board.', render: setting => { setting.addDropdown(dropdown => {
            dropdown.addOptions({ '140': 'Compact', '190': 'Comfortable', '250': 'Wide' });
            const field = this.track('dayWidth', setting, dropdown.selectEl, () => Number(dropdown.getValue()), value => { dropdown.setValue(String(value)); });
            dropdown.onChange(value => { if (!this.synchronizing) { this.edit(field); this.save(field, Number(value)); } });
          }); } },
        ],
      },
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
