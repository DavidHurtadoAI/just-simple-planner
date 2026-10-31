import { PluginSettingTab, Setting, Notice, requireApiVersion, type App, type SettingDefinitionItem } from 'obsidian';
import type JustSimplePlanner from './main';
import { cloneSettings, DEFAULT_PROPERTIES, type PlannerSettings, type EntryProperty } from './settings';

interface SettingRow { name: string; desc: string; render?: (setting: Setting) => void }
interface SettingSection { heading: string; rows: SettingRow[] }

export class PlannerSettingsTab extends PluginSettingTab {
  private draft: PlannerSettings;
  private folderRow: HTMLElement | null = null;
  private feedback: Setting | null = null;
  private saving = false;

  constructor(app: App, private readonly plugin: JustSimplePlanner) { super(app, plugin); this.draft = cloneSettings(plugin.settings); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    this.draft = cloneSettings(this.plugin.settings);
    return this.sections().map(section => ({ type: 'group', heading: section.heading, items: section.rows.map(row => row.render ? { name: row.name, desc: row.desc, render: row.render } : { name: row.name, desc: row.desc }) }));
  }

  synchronize(): void {
    this.draft = cloneSettings(this.plugin.settings);
    if (requireApiVersion('1.13.0')) this.update();
    else this.renderLegacy();
  }

  private sections(): SettingSection[] {
    const property = (key: EntryProperty, name: string, desc: string): SettingRow => ({
      name, desc: `${desc}. Default: ${DEFAULT_PROPERTIES[key]}.`,
      render: setting => { setting.addText(input => input.setPlaceholder(DEFAULT_PROPERTIES[key]).setValue(this.draft.propertyNames[key]).onChange(value => { this.draft.propertyNames[key] = value; })); },
    });
    return [
      {
        heading: 'Search scope', rows: [
          { name: 'Which notes appear?', desc: 'Only notes marked planner_type: entry or planner_type: thread are included. Search scope controls what appears on the board; creation folders below only control where new notes are saved.' },
          {
            name: 'Search entire vault', desc: 'On: find planner entries and threads in every folder. Off: search only the folder selected below and its subfolders. Default: on.',
            render: setting => { setting.addToggle(toggle => toggle.setValue(this.draft.searchEntireVault).onChange(value => { this.draft.searchEntireVault = value; this.folderRow?.toggleClass('jsp-setting-hidden', value); })); },
          },
          {
            name: 'Search folder', desc: 'Required when Search entire vault is off. Choose an existing vault-relative folder, such as Projects. This includes its subfolders and applies to both entry and thread notes. Linked notes outside it are not added to the board.',
            render: setting => { this.folderRow = setting.settingEl; this.folderRow.toggleClass('jsp-setting-hidden', this.draft.searchEntireVault); setting.addText(input => input.setPlaceholder('Projects').setValue(this.draft.searchFolder).onChange(value => { this.draft.searchFolder = value; })); },
          },
        ],
      },
      {
        heading: 'New note locations', rows: [
          { name: 'Saving and searching are independent', desc: 'These folders do not filter existing notes or move any files. If a creation folder is outside your search scope, new notes saved there will be hidden until you change the scope.' },
          { name: 'New entries folder', desc: 'Save newly created entry notes here. Default: Planner/Entries. Leave empty to save in the vault root.', render: setting => { setting.addText(input => input.setPlaceholder('Vault root').setValue(this.draft.entryFolder).onChange(value => { this.draft.entryFolder = value; })); } },
          { name: 'New threads folder', desc: 'Save newly created thread notes here. Default: Planner/Threads. Leave empty to save in the vault root.', render: setting => { setting.addText(input => input.setPlaceholder('Vault root').setValue(this.draft.threadFolder).onChange(value => { this.draft.threadFolder = value; })); } },
        ],
      },
      {
        heading: 'Property mapping', rows: [
          { name: 'Use your existing frontmatter names', desc: 'Enter four different, non-empty YAML property names. The planner uses these exact keys when reading, creating, editing, moving and connecting entries. planner_type stays fixed and is reserved.' },
          property('date', 'Date property', 'Calendar date in YYYY-MM-DD format. An entry must have a valid date under this key to appear'),
          property('title', 'Title property', 'Text shown on the card. When the property value is empty or missing, the filename is used'),
          property('thread', 'Thread property', 'A wikilink to a thread note, or a plain-text group name'),
          property('next', 'Connections property', 'A YAML list of wikilinks to following entries. This controls arrows and connected flows'),
          { name: 'Changing the mapping does not migrate notes', desc: 'Existing properties and files are not renamed or rewritten. Notes using a different date key will be excluded and counted as invalid until their properties match, or you restore the previous mapping. Session undo/redo is cleared when scope or mapping changes. Thread-note properties status, color and order keep their names.' },
        ],
      },
      {
        heading: 'Display', rows: [
          { name: 'Day width', desc: 'Default spacing between dates on the board.', render: setting => { setting.addDropdown(dropdown => dropdown.addOptions({ '140': 'Compact', '190': 'Comfortable', '250': 'Wide' }).setValue(String(this.draft.dayWidth)).onChange(value => { this.draft.dayWidth = Number(value); })); } },
        ],
      },
      {
        heading: 'Apply changes', rows: [
          {
            name: 'Apply settings', desc: 'Changes are saved together only when you select Apply settings. Search folder and property names are validated first. Applying settings never moves files or migrates note properties.',
            render: setting => {
              this.feedback = setting;
              setting.addButton(button => button.setButtonText('Apply settings').setCta().onClick(async () => {
                if (this.saving) return;
                this.saving = true; button.setDisabled(true);
                try {
                  await this.plugin.applySettings(this.draft);
                  this.draft = cloneSettings(this.plugin.settings);
                  this.feedback?.setDesc(`Settings saved. Current scope contains ${this.plugin.entries.size} entries and ${this.plugin.threads.size} thread notes${this.plugin.invalid.size ? `; ${this.plugin.invalid.size} notes have an invalid or missing mapped date` : ''}. Existing note files were not changed.`);
                  new Notice('Planner settings saved.');
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  this.feedback?.setDesc(message); new Notice(message, 9000);
                } finally { this.saving = false; button.setDisabled(false); }
              }));
            },
          },
        ],
      },
    ];
  }

  // Obsidian before 1.13 uses the same draft fields and help text through this fallback.
  display(): void { this.renderLegacy(); }

  private renderLegacy(): void {
    this.draft = cloneSettings(this.plugin.settings);
    this.containerEl.empty();
    for (const section of this.sections()) {
      new Setting(this.containerEl).setName(section.heading).setHeading();
      for (const row of section.rows) { const setting = new Setting(this.containerEl).setName(row.name).setDesc(row.desc); row.render?.(setting); }
    }
  }
}
