import { Modal, Setting, Notice, SuggestModal, type App } from 'obsidian';
import type JustSimplePlanner from './main';
import { validDay, type Entry } from './model';

export class EntryModal extends Modal {
  private saving = false;
  constructor(app: App, private readonly plugin: JustSimplePlanner, private readonly options: { date: string; thread: string; previous?: string; entry?: Entry }) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('jsp-entry-modal');
    this.setTitle(this.options.entry ? 'Edit entry' : 'New entry');
    let title = this.options.entry?.title ?? '';
    let date = this.options.date;
    let thread = this.options.thread;
    let body = this.options.entry?.body ?? '';
    let titleInput: HTMLInputElement | null = null;
    new Setting(this.contentEl).setName('Title').addText(text => { titleInput = text.inputEl; text.setPlaceholder('Entry title').setValue(title).onChange(value => { title = value; }); });
    new Setting(this.contentEl).setName('Date').addText(text => { text.inputEl.type = 'date'; text.setValue(date).onChange(value => { date = value; }); });
    new Setting(this.contentEl).setName('Thread').addDropdown(dropdown => {
      dropdown.addOption('', 'Unassigned');
      for (const row of this.plugin.rows()) if (row.path !== 'unassigned') dropdown.addOption(row.path, row.title);
      dropdown.setValue(thread === 'unassigned' ? '' : thread).onChange(value => { thread = value; });
    });
    this.contentEl.createEl('label', { text: 'Markdown', cls: 'jsp-markdown-label' });
    const input = this.contentEl.createEl('textarea', { cls: 'jsp-markdown-input', attr: { 'aria-label': 'Markdown', placeholder: 'Write a note. Use - [ ] for tasks.' } });
    input.value = body;
    input.addEventListener('input', () => { body = input.value; });
    new Setting(this.contentEl).addButton(button => button.setButtonText('Cancel').onClick(() => this.close())).addButton(button => {
      button.setButtonText('Save').setCta().onClick(() => {
        if (this.saving) return;
        if (!title.trim() || !validDay(date)) { new Notice('Enter a title and a valid date.'); return; }
        this.saving = true; button.setDisabled(true);
        void (async () => {
          try {
            const fields = { title: title.trim(), date, thread: thread ? thread.startsWith('text:') ? thread.slice(5) : this.plugin.link(thread) : '' };
            if (this.options.entry) await this.plugin.patch([{ path: this.options.entry.path, fields, body, expectedText: this.options.entry.snapshot, expectedBody: this.options.entry.body, expectedDate: this.options.entry.date }]);
            else await this.plugin.createEntry(title.trim(), date, thread, body, this.options.previous);
            this.plugin.refresh(); this.close();
          } catch (error) { new Notice(error instanceof Error ? error.message : String(error), 9000); }
          finally { this.saving = false; button.setDisabled(false); }
        })();
      });
    });
    if (titleInput) (titleInput as HTMLInputElement).focus();
  }
  onClose(): void { this.contentEl.empty(); }
}

export class ThreadModal extends Modal {
  constructor(app: App, private readonly plugin: JustSimplePlanner) { super(app); }
  onOpen(): void {
    this.setTitle('New thread');
    let title = ''; let color = 'blue'; let status = 'active'; let saving = false;
    new Setting(this.contentEl).setName('Title').addText(text => text.setPlaceholder('Thread title').onChange(value => { title = value; }));
    new Setting(this.contentEl).setName('Color').addDropdown(dropdown => dropdown.addOptions({ blue: 'Blue', cyan: 'Cyan', green: 'Green', orange: 'Orange', pink: 'Pink', purple: 'Purple', red: 'Red', yellow: 'Yellow' }).setValue(color).onChange(value => { color = value; }));
    new Setting(this.contentEl).setName('Status').addDropdown(dropdown => dropdown.addOptions({ active: 'Active', parked: 'Parked', closed: 'Closed' }).onChange(value => { status = value; }));
    new Setting(this.contentEl).addButton(button => button.setButtonText('Cancel').onClick(() => this.close())).addButton(button => button.setButtonText('Create').setCta().onClick(() => {
      if (!title.trim() || saving) return;
      saving = true;
      void (async () => {
        try { await this.plugin.createThread(title.trim(), color, status); this.plugin.refresh(); this.close(); }
        catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
        finally { saving = false; }
      })();
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}

export class ConnectModal extends SuggestModal<Entry> {
  constructor(app: App, private readonly plugin: JustSimplePlanner, private readonly source: Entry) { super(app); this.setPlaceholder('Connect to an entry…'); }
  getSuggestions(query: string): Entry[] {
    return [...this.plugin.entries.values()].filter(entry => entry.path !== this.source.path && `${entry.title} ${entry.date}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  }
  renderSuggestion(entry: Entry, el: HTMLElement): void { el.createDiv({ text: entry.title }); el.createEl('small', { text: `${entry.date} · ${this.plugin.rows().find(row => row.path === entry.thread)?.title ?? 'Unassigned'}` }); }
  onChooseSuggestion(entry: Entry): void { void this.plugin.perform(() => this.plugin.connect(this.source.path, entry.path)); }
}
