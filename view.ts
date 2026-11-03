import { ItemView, Component, MarkdownRenderer, Menu, Notice, Scope, setIcon, type App, type WorkspaceLeaf, type HoverParent, type HoverPopover } from 'obsidian';
import type JustSimplePlanner from './main';
import type { PlannerController } from './controller';
import { connected, spotlight, stackEntries, boardSpan, entryEnd, tasks, today, shiftDay, dayNumber, validDay, dateMoves, type Entry, type Thread } from './model';
import { ConnectModal, ThreadModal } from './modals';

export const VIEW_TYPE = 'just-simple-planner';
export const PLANNER_ICON = 'workflow';
const DAYS = 91;
const LABEL = 184;
const SVG = 'http://www.w3.org/2000/svg';

type DragState = { path: string; entries: Map<string, Entry>; paths: Set<string>; dayOffset: number };
type ConnectionDrag = { pointerId: number; source: string; target: string | null; sourceCard: HTMLElement; targetCard: HTMLElement | null; startX: number; startY: number; x: number; y: number; moved: boolean };

export class PlannerSurface extends Component implements HoverParent {
  hoverPopover: HoverPopover | null = null;
  private root!: HTMLElement;
  private scroll!: HTMLElement;
  private stage!: HTMLElement;
  private rail!: HTMLElement;
  private footer!: HTMLElement;
  private modeButton!: HTMLButtonElement;
  private focusButton!: HTMLButtonElement;
  private undoButton!: HTMLButtonElement;
  private redoButton!: HTMLButtonElement;
  private selected = new Set<string>();
  private collapsed = new Set<string>();
  private focusPath: string | null = null;
  private activeThread = '';
  private search = '';
  private status = 'all';
  private mode: 'board' | 'notebook' = 'board';
  private showTasks = false;
  private firstDay = shiftDay(today(), -30);
  private notebookDate = today();
  private initialScroll = true;
  private restoredScroll: { left: number; top: number } | null = null;
  private visibleScroll: { left: number; top: number } | null = null;
  private renderPending = false;
  private scrolling = false;
  private panning = false;
  private dragging: DragState | null = null;
  private dropped = false;
  private renderComponent: Component | null = null;
  private drawFrame = 0;
  private renderedCards = new Map<string, HTMLElement>();
  private allCards = new Set<HTMLElement>();
  private footerSummary = '';
  private edgeLayer: SVGSVGElement | null = null;
  private linking: ConnectionDrag | null = null;
  private connectionPreview: SVGSVGElement | null = null;
  private connectionFrame = 0;
  private suppressConnectorClickUntil = 0;

  constructor(readonly app: App, readonly contentEl: HTMLElement, private readonly plugin: PlannerController, private readonly saveState?: () => void) { super(); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Just Simple Planner'; }
  getIcon(): string { return PLANNER_ICON; }

  getState(): Record<string, unknown> {
    const position = this.restoredScroll ?? (!this.scroll?.clientWidth ? this.visibleScroll : null);
    return { mode: this.mode, firstDay: this.firstDay, collapsed: [...this.collapsed], activeThread: this.activeThread, search: this.search, status: this.status, showTasks: this.showTasks, scrollLeft: position?.left ?? this.scroll?.scrollLeft ?? 28 * this.plugin.settings.dayWidth, scrollTop: position?.top ?? this.scroll?.scrollTop ?? 0 };
  }
  async setState(state: Record<string, unknown>): Promise<void> {
    if (state.mode === 'board' || state.mode === 'notebook') this.mode = state.mode;
    if (validDay(state.firstDay)) this.firstDay = state.firstDay;
    if (Array.isArray(state.collapsed)) this.collapsed = new Set(state.collapsed.filter((value): value is string => typeof value === 'string'));
    if (typeof state.activeThread === 'string') this.activeThread = state.activeThread;
    if (typeof state.search === 'string') this.search = state.search;
    if (['all', 'active', 'parked', 'closed'].includes(String(state.status))) this.status = String(state.status);
    if (typeof state.showTasks === 'boolean') this.showTasks = state.showTasks;
    if (typeof state.scrollLeft === 'number' && Number.isFinite(state.scrollLeft) && state.scrollLeft >= 0) {
      this.restoredScroll = { left: state.scrollLeft, top: typeof state.scrollTop === 'number' && Number.isFinite(state.scrollTop) && state.scrollTop >= 0 ? state.scrollTop : 0 };
      this.initialScroll = false;
    } else this.initialScroll = true;
    const search = this.root?.querySelector<HTMLInputElement>('.jsp-search'); if (search) search.value = this.search;
    const status = this.root?.querySelector<HTMLSelectElement>('[aria-label="Thread status"]'); if (status) status.value = this.status;
    this.render();
  }

  revealEntry(entry: Entry): void {
    this.mode = 'board'; this.search = ''; this.status = 'all';
    this.selected = new Set([entry.path]); this.activeThread = entry.thread;
    this.collapsed.delete(entry.thread);
    this.root.querySelector<HTMLInputElement>('.jsp-search')!.value = '';
    this.root.querySelector<HTMLSelectElement>('[aria-label="Thread status"]')!.value = 'all';
    this.jump(entry.date);
  }

  onload(): void {
    this.contentEl.empty();
    this.contentEl.addClass('jsp-container');
    this.root = this.contentEl.createDiv({ cls: 'jsp-view', attr: { tabindex: '0', 'aria-label': 'Just Simple Planner' } });
    if (!this.plugin.basesMode) {
      const transition = this.root.createDiv({ cls: 'jsp-transition', attr: { role: 'note' } });
      transition.createSpan({ text: 'Classic view (deprecated) · Still available during the Bases transition. No removal date is set. Your notes stay in place.' });
      if (this.plugin.openMigration) this.button(transition, 'Create Bases planner', 'workflow', () => this.plugin.openMigration!());
    }
    const toolbar = this.root.createDiv({ cls: 'jsp-toolbar' });
    const brand = toolbar.createDiv({ cls: 'jsp-brand' });
    setIcon(brand.createSpan(), PLANNER_ICON); brand.createSpan({ text: 'Just Simple Planner' });
    const search = toolbar.createEl('input', { cls: 'jsp-search', attr: { type: 'search', placeholder: 'Filter entries…', 'aria-label': 'Filter entries' } });
    search.value = this.search;
    this.registerDomEvent(search, 'input', () => { this.search = search.value; this.render(); });
    const status = toolbar.createEl('select', { attr: { 'aria-label': 'Thread status' } });
    for (const [value, label] of [['all', 'All threads'], ['active', 'Active'], ['parked', 'Parked'], ['closed', 'Closed']]) status.createEl('option', { text: label, value });
    status.value = this.status;
    this.registerDomEvent(status, 'change', () => { this.status = status.value; this.render(); });
    this.modeButton = this.button(toolbar, 'Notebook', 'notebook-text', () => { this.mode = this.mode === 'board' ? 'notebook' : 'board'; this.initialScroll = true; this.render(); });
    const creation = toolbar.createDiv({ cls: 'jsp-create-actions', attr: { role: 'group', 'aria-label': 'Create notes' } });
    if (this.plugin.manageThreads) this.button(creation, 'Thread notes', 'list-tree', () => this.plugin.manageThreads!());
    this.button(creation, 'New thread', 'plus', () => new ThreadModal(this.app, this.plugin).open());
    this.button(creation, 'New entry', 'square-pen', () => this.plugin.newEntry(today(), this.activeThread || this.plugin.rows()[0]?.path || ''));
    const navigation = this.root.createDiv({ cls: 'jsp-navigation' });
    this.button(navigation, 'Earlier', 'chevron-left', () => this.jump(shiftDay(this.centerDay(), -7)));
    this.button(navigation, 'Today', 'calendar-check', () => this.jump(today()));
    this.button(navigation, 'Later', 'chevron-right', () => this.jump(shiftDay(this.centerDay(), 7)));
    const date = navigation.createEl('input', { attr: { type: 'date', 'aria-label': 'Go to date', title: 'Go to date' } });
    date.value = today();
    this.registerDomEvent(date, 'change', () => { if (validDay(date.value)) this.jump(date.value); });
    this.undoButton = this.button(navigation, 'Undo', 'undo-2', () => { void this.plugin.perform(() => this.plugin.history.undo()); });
    this.redoButton = this.button(navigation, 'Redo', 'redo-2', () => { void this.plugin.perform(() => this.plugin.history.redo()); });
    this.focusButton = this.button(navigation, 'Clear focus', 'focus', () => { this.focusPath = null; this.render(); });
    const tasksButton = this.button(navigation, 'Tasks', 'list-checks', () => { this.showTasks = !this.showTasks; tasksButton.setAttribute('aria-pressed', String(this.showTasks)); this.render(); });
    navigation.createSpan({ cls: 'jsp-hint', text: 'Middle / Ctrl/Cmd-drag: pan · Shift+wheel: sideways', attr: { title: 'Left-drag: move entries · Middle-drag or Ctrl/Cmd + left-drag: pan · Shift+wheel: scroll sideways · Ctrl/Cmd-click: select · Shift-drag: move flow · Tab: next step' } });
    const work = this.root.createDiv({ cls: 'jsp-work' });
    this.scroll = work.createDiv({ cls: 'jsp-scroll', attr: { 'aria-label': 'Planner timeline', tabindex: '0' } });
    this.rail = work.createDiv({ cls: 'jsp-task-rail', attr: { 'aria-label': 'Pending tasks' } });
    this.footer = this.root.createDiv({ cls: 'jsp-footer', attr: { role: 'status' } });
    this.registerDomEvent(this.scroll, 'scroll', () => this.onScroll(), { passive: true });
    this.configurePan();
    this.configureConnections();
    this.registerDomEvent(this.root, 'dragenter', event => {
      if (this.isExternalNoteDrag(event)) this.root.addClass('jsp-importing');
    });
    this.registerDomEvent(this.root, 'dragleave', event => {
      if (!this.root.contains(event.relatedTarget as Node | null)) this.root.removeClass('jsp-importing');
    });
    this.registerDomEvent(this.root.doc, 'dragend', () => {
      this.root.removeClass('jsp-importing');
      for (const target of this.root.querySelectorAll('.is-note-drop-target')) target.removeClass('is-note-drop-target');
      for (const preview of this.root.querySelectorAll('.jsp-drop-preview')) preview.remove();
    });
    this.registerDomEvent(this.root, 'keydown', event => { if (!event.defaultPrevented) this.onKey(event); });
    // Obsidian resolves global hotkeys before DOM bubbling (F2 renames a file).
    // A focused planner needs a native scope so its handled keys take priority.
    const scope = new Scope(this.app.scope);
    let scopeActive = false;
    const releaseScope = (): void => { if (scopeActive) { this.app.keymap.popScope(scope); scopeActive = false; } };
    scope.register(null, null, event => {
      if (!this.root.contains(event.target as Node | null)) return;
      this.onKey(event);
      if (event.defaultPrevented) { event.stopImmediatePropagation(); return false; }
    });
    this.registerDomEvent(this.root, 'focusin', () => { if (!scopeActive) { this.app.keymap.pushScope(scope); scopeActive = true; } });
    this.registerDomEvent(this.root, 'focusout', event => { if (!this.root.contains(event.relatedTarget as Node | null)) releaseScope(); });
    this.register(releaseScope);
    const observer = new ResizeObserver(() => {
      if (!this.scroll.clientWidth) { this.renderPending = true; return; }
      if (this.renderPending) this.render();
      this.queueEdges();
    });
    observer.observe(this.scroll);
    this.register(() => observer.disconnect());
    this.render();
  }

  onunload(): void {
    this.finishConnection(false, false);
    if (this.drawFrame) this.root.win.cancelAnimationFrame(this.drawFrame);
    if (this.renderComponent) { this.renderComponent.unload(); this.removeChild(this.renderComponent); }
    this.contentEl.removeClass('jsp-container');
    this.contentEl.empty();
  }

  private button(parent: HTMLElement, label: string, icon: string, action: () => void): HTMLButtonElement {
    const button = parent.createEl('button', { cls: 'jsp-button', attr: { type: 'button', title: label, 'aria-label': label } });
    setIcon(button.createSpan(), icon); button.createSpan({ text: label });
    button.addEventListener('click', action);
    return button;
  }

  private configurePan(): void {
    const viewport = this.scroll;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let pendingX = 0;
    let pendingY = 0;
    let frame = 0;
    let modifiedPrimary = false;
    let moved = false;
    let suppressClick = false;
    let clickTimer = 0;
    const cancelFrame = (): void => {
      if (frame) this.root.win.cancelAnimationFrame(frame);
      frame = 0;
    };
    const applyPan = (): void => {
      frame = 0;
      // Match Visual Card Writer: grab the content and move it with the pointer.
      viewport.scrollLeft = startLeft - (pendingX - startX);
      viewport.scrollTop = startTop - (pendingY - startY);
    };
    const finishPan = (event: PointerEvent): void => {
      if (pointerId !== event.pointerId) return;
      if (frame) { cancelFrame(); applyPan(); }
      const clickOnly = modifiedPrimary && !moved;
      if (modifiedPrimary && moved && event.type === 'pointerup') {
        suppressClick = true;
        // Consume the click generated by this release, without swallowing a later click.
        clickTimer = this.root.win.setTimeout(() => { suppressClick = false; clickTimer = 0; }, 0);
      }
      pointerId = null;
      this.panning = false;
      viewport.removeClass('is-panning');
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      // Keep the original card alive until a stationary Ctrl/Cmd-click selects it.
      if (clickOnly) { this.plugin.scheduleRefresh(); return; }
      this.render();
      this.onScroll();
    };
    this.registerDomEvent(viewport, 'pointerdown', event => {
      if (pointerId !== null || this.dragging || this.linking) return;
      const primary = event.button === 0 && (event.ctrlKey || event.metaKey);
      if (event.button !== 1 && !primary) return;
      if (primary && (this.mode !== 'board' || (event.target as Element).closest('a, button, input, select, textarea, [contenteditable="true"]'))) return;
      event.preventDefault();
      event.stopPropagation();
      pointerId = event.pointerId;
      modifiedPrimary = primary;
      moved = false;
      startX = pendingX = event.clientX;
      startY = pendingY = event.clientY;
      startLeft = viewport.scrollLeft;
      startTop = viewport.scrollTop;
      this.panning = true;
      viewport.addClass('is-panning');
      // Capturing immediately would retarget an ordinary Ctrl/Cmd-click away from its card.
      if (!modifiedPrimary) {
        try { viewport.setPointerCapture(event.pointerId); }
        catch { /* Synthetic pointer events may not own a capturable pointer. */ }
      }
    });
    this.registerDomEvent(this.root.win, 'pointermove', event => {
      if (pointerId !== event.pointerId) return;
      event.preventDefault();
      pendingX = event.clientX;
      pendingY = event.clientY;
      if (modifiedPrimary && !moved) {
        if (Math.hypot(pendingX - startX, pendingY - startY) < 5) return;
        try { viewport.setPointerCapture(event.pointerId); }
        catch { /* Synthetic pointer events may not own a capturable pointer. */ }
      }
      moved = true;
      if (!frame) frame = this.root.win.requestAnimationFrame(applyPan);
    });
    this.registerDomEvent(this.root.win, 'pointerup', finishPan);
    this.registerDomEvent(this.root.win, 'pointercancel', finishPan);
    const abortPan = (): void => {
      if (pointerId === null) return;
      const id = pointerId;
      cancelFrame(); pointerId = null; this.panning = false;
      viewport.removeClass('is-panning');
      if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
      this.render(); this.onScroll();
    };
    this.registerDomEvent(viewport, 'lostpointercapture', event => { if (pointerId === event.pointerId) abortPan(); });
    this.registerDomEvent(this.root.win, 'blur', abortPan);
    this.registerDomEvent(viewport, 'click', event => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault(); event.stopPropagation();
    }, { capture: true });
    // Prevent Chromium's middle-button autoscroll and link-opening defaults.
    this.registerDomEvent(viewport, 'mousedown', event => { if (event.button === 1) event.preventDefault(); });
    this.registerDomEvent(viewport, 'auxclick', event => { if (event.button === 1) event.preventDefault(); });
    this.registerDomEvent(viewport, 'wheel', event => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? Math.max(1, viewport.clientHeight) : 1;
      viewport.scrollLeft += event.deltaY * multiplier;
    }, { passive: false });
    this.register(() => { cancelFrame(); if (clickTimer) this.root.win.clearTimeout(clickTimer); this.panning = false; viewport.removeClass('is-panning'); });
  }

  private centerDay(): string {
    if (this.mode === 'notebook') return this.notebookDate;
    return shiftDay(this.firstDay, Math.floor((this.scroll?.scrollLeft ?? 30 * this.plugin.settings.dayWidth) / this.plugin.settings.dayWidth));
  }

  private jump(day: string): void {
    this.firstDay = shiftDay(day, -30); this.notebookDate = day; this.initialScroll = true; this.render();
    if (this.mode === 'notebook') {
      const headings = [...this.scroll.querySelectorAll<HTMLElement>('.jsp-notebook-content h3[data-date]')];
      const target = headings.find(heading => heading.dataset.date! >= day) ?? headings[headings.length - 1];
      if (target) this.scroll.scrollTop += target.getBoundingClientRect().top - this.scroll.getBoundingClientRect().top - 12;
    }
  }

  render(): void {
    if (!this.root || this.dragging || this.panning || this.linking) return;
    // Hidden tabs report zero scroll geometry. Keep the last visible position
    // and apply pending data/state when the pane has a usable width again.
    if (!this.scroll.clientWidth) { this.renderPending = true; return; }
    const active = this.root.doc.activeElement as HTMLElement | null;
    const focusedPath = active?.closest<HTMLElement>('.jsp-card')?.dataset.path;
    const focusedDate = active?.closest<HTMLElement>('.jsp-card')?.dataset.date;
    this.selected = new Set([...this.selected].filter(path => this.plugin.entries.has(path)));
    const position = this.renderPending ? this.visibleScroll : null;
    const left = position?.left ?? this.scroll.scrollLeft; const top = position?.top ?? this.scroll.scrollTop;
    this.renderPending = false;
    this.scrolling = true;
    if (this.renderComponent) { this.renderComponent.unload(); this.removeChild(this.renderComponent); }
    this.renderComponent = this.addChild(new Component());
    this.scroll.empty(); this.rail.empty(); this.renderedCards.clear(); this.allCards.clear();
    const query = this.search.toLocaleLowerCase().trim();
    const entries = [...this.plugin.entries.values()].filter(entry => !query || `${entry.title} ${entry.body}`.toLocaleLowerCase().includes(query));
    const rows = this.plugin.rows().filter(row => (this.status === 'all' || row.status === this.status) && (!query || entries.some(entry => entry.thread === row.path) || row.title.toLocaleLowerCase().includes(query)));
    this.modeButton.querySelector('span:last-child')!.textContent = this.mode === 'board' ? 'Notebook' : 'Board';
    this.modeButton.setAttribute('aria-label', this.mode === 'board' ? 'Switch to notebook' : 'Switch to board');
    this.undoButton.disabled = !this.plugin.history.canUndo || this.plugin.history.busy;
    this.redoButton.disabled = !this.plugin.history.canRedo || this.plugin.history.busy;
    this.focusButton.hidden = !this.focusPath;
    this.rail.hidden = !this.showTasks;
    this.root.toggleClass('jsp-has-tasks', this.showTasks);
    this.root.querySelector('[aria-label="Tasks"]')?.setAttribute('aria-pressed', String(this.showTasks));
    if (this.mode === 'board') this.renderBoard(rows, entries);
    else this.renderNotebook(rows, entries);
    if (!rows.length) {
      const empty = this.scroll.createDiv({ cls: 'jsp-empty' });
      const issue = this.plugin.configurationIssue();
      empty.createEl('h3', { text: issue ? 'Review planner settings' : this.plugin.entries.size || this.plugin.threads.size ? 'No matching threads' : 'Your notes, over time' });
      empty.createEl('p', { text: issue ?? (this.plugin.basesMode ? 'This Base selects the notes. Create an entry, add a thread row or adjust the Base filters and Date property. Selected Markdown notes with a valid date appear here; a planner marker is not required.' : 'Create a thread or entry, right-click a Markdown note in the file explorer and choose Add note to planner, or drop a note here. Only marked entries with a valid configured date appear; notes can stay anywhere in the vault.') });
      this.button(empty, 'New thread', 'plus', () => new ThreadModal(this.app, this.plugin).open());
      this.bindNoteDrop(empty, null, false);
    }
    if (this.showTasks) this.renderTasks(entries, rows);
    const count = rows.reduce((sum, row) => sum + entries.filter(entry => entry.thread === row.path).length, 0);
    this.footerSummary = `${this.plugin.scopeMessage ? this.plugin.scopeMessage + ' · ' : ''}${count} entries · ${rows.length} threads${this.plugin.schedulingEnabled ? ` · ${this.allCards.size} visible appearances` : ''}${this.plugin.invalid.size ? ` · ${this.plugin.invalid.size} notes with invalid date or frontmatter` : ''}`;
    this.updateFooter();
    this.scroll.scrollTop = this.restoredScroll?.top ?? top;
    if (this.restoredScroll) { this.scroll.scrollLeft = this.restoredScroll.left; this.restoredScroll = null; }
    else if (this.initialScroll && this.mode === 'board') { this.scroll.scrollLeft = 28 * this.plugin.settings.dayWidth; this.initialScroll = false; }
    else this.scroll.scrollLeft = left;
    this.scrolling = false;
    if (focusedPath) ([...this.allCards].find(card => card.dataset.path === focusedPath && card.dataset.date === focusedDate) ?? this.renderedCards.get(focusedPath))?.focus({ preventScroll: true });
    this.persistState();
    this.queueEdges();
  }

  private flowPaths(start: Iterable<string>): Set<string> {
    return this.plugin.flowPaths ? this.plugin.flowPaths(start) : connected(this.plugin.entries, start);
  }

  private updateFooter(): void {
    this.footer.setText(`${this.footerSummary} · ${this.selected.size} selected · All changes are saved to Markdown`);
    this.footer.title = this.plugin.scheduleNotice ?? '';
  }

  private persistState(): void {
    if (!this.scroll.clientWidth) return;
    this.visibleScroll = { left: this.scroll.scrollLeft, top: this.scroll.scrollTop };
    if (this.saveState) this.saveState(); else this.app.workspace.requestSaveLayout();
  }

  private color(row: Thread): string {
    return /^(red|orange|yellow|green|cyan|blue|purple|pink)$/.test(row.color) ? `var(--color-${row.color})` : /^#[0-9a-f]{6}$/i.test(row.color) ? row.color : 'var(--color-blue)';
  }

  private renderBoard(rows: Thread[], entries: Entry[]): void {
    const width = this.plugin.settings.dayWidth;
    const finalDay = shiftDay(this.firstDay, DAYS - 1);
    const appearances = this.plugin.projectEntries?.(entries, this.firstDay, finalDay) ?? entries;
    this.stage = this.scroll.createDiv({ cls: 'jsp-board' });
    this.stage.style.setProperty('--jsp-day-width', `${width}px`);
    this.stage.style.width = `${LABEL + DAYS * width}px`;
    const header = this.stage.createDiv({ cls: 'jsp-header' });
    const corner = header.createDiv({ cls: 'jsp-corner' });
    corner.createSpan({ text: 'Threads' });
    this.button(corner, 'Collapse all', 'chevrons-down-up', () => { this.collapsed = this.collapsed.size >= rows.length ? new Set() : new Set(rows.map(row => row.path)); this.render(); });
    const days = header.createDiv({ cls: 'jsp-days' });
    for (let index = 0; index < DAYS; index++) {
      const day = shiftDay(this.firstDay, index);
      const value = new Date(`${day}T12:00:00`);
      const cell = days.createDiv({ cls: 'jsp-day', attr: { 'data-date': day } });
      cell.toggleClass('is-today', day === today()); cell.toggleClass('is-weekend', [0, 6].includes(value.getDay()));
      cell.createSpan({ text: value.toLocaleDateString(undefined, { month: 'short', weekday: 'short' }) });
      cell.createEl('strong', { text: String(value.getDate()) });
    }
    const focus = this.focusPath ? spotlight(this.plugin.entries, this.focusPath) : null;
    for (const row of rows) {
      const folded = this.collapsed.has(row.path);
      const visible = appearances.filter(entry => entry.thread === row.path && boardSpan(entry, this.firstDay, finalDay) !== null);
      const stack = stackEntries(visible, folded, this.plugin.queryOrder);
      const extent = stack.length ? Math.max(...stack.map(item => item.top + item.height + (folded ? 4 : 16))) : folded ? 28 : 132;
      const element = this.stage.createDiv({ cls: 'jsp-row', attr: { 'data-thread': row.path } });
      element.style.setProperty('--jsp-thread-color', this.color(row));
      element.style.height = `${Math.max(folded ? 46 : 100, extent + (folded ? 18 : 20))}px`;
      const label = element.createDiv({ cls: 'jsp-thread-label' });
      const toggle = label.createEl('button', { cls: 'jsp-thread-toggle', attr: { 'aria-label': `${folded ? 'Expand' : 'Collapse'} ${row.title}`, 'aria-expanded': String(!folded) } });
      setIcon(toggle.createSpan(), folded ? 'chevron-right' : 'chevron-down');
      toggle.createSpan({ text: row.title });
      toggle.addEventListener('click', () => { if (folded) this.collapsed.delete(row.path); else this.collapsed.add(row.path); this.activeThread = row.path; this.render(); });
      if (!folded) {
        label.createDiv({ cls: 'jsp-thread-meta', text: `${row.status} · ${entries.filter(entry => entry.thread === row.path).length} entries` });
        this.button(label, 'Add entry', 'plus', () => this.plugin.newEntry(today(), row.path));
      }
      label.addEventListener('contextmenu', event => { event.preventDefault(); this.threadMenu(event, row); });
      label.title = 'Drop an existing note here to keep its date. You can review the changes before saving.';
      this.bindNoteDrop(label, row, false);
      const lane = element.createDiv({ cls: 'jsp-lane', attr: { 'data-thread': row.path } });
      lane.style.width = `${DAYS * width}px`;
      const todayIndex = dayNumber(today()) - dayNumber(this.firstDay);
      if (todayIndex >= 0 && todayIndex < DAYS) { const band = lane.createDiv({ cls: 'jsp-today-band' }); band.style.left = `${todayIndex * width}px`; band.style.width = `${width}px`; }
      for (const { entry, top, height } of stack) {
        const span = boardSpan(entry, this.firstDay, finalDay)!;
        const card = this.card(lane, entry, focus, folded);
        card.style.left = `${(dayNumber(span.start) - dayNumber(this.firstDay)) * width + 10}px`;
        card.style.top = `${top + 10}px`;
        card.style.setProperty('--jsp-card-height', `${height}px`);
        card.style.width = `${span.days * width - 20}px`;
        card.toggleClass('continues-before', span.continuesBefore); card.toggleClass('continues-after', span.continuesAfter);
      }
      lane.addEventListener('dblclick', event => {
        if ((event.target as HTMLElement).closest('.jsp-card')) return;
        const index = Math.floor((event.clientX - lane.getBoundingClientRect().left) / width);
        if (index >= 0 && index < DAYS) this.plugin.newEntry(shiftDay(this.firstDay, index), row.path);
      });
      lane.addEventListener('dragover', event => {
        if (!this.dragging) return;
        event.preventDefault(); event.dataTransfer!.dropEffect = 'move';
        lane.addClass('is-drop-target');
      });
      lane.addEventListener('dragleave', event => { if (!lane.contains(event.relatedTarget as Node)) lane.removeClass('is-drop-target'); });
      lane.addEventListener('drop', event => this.drop(event, lane, row));
      this.bindNoteDrop(lane, row, true);
    }
    this.edgeLayer = document.createElementNS(SVG, 'svg');
    this.edgeLayer.classList.add('jsp-edges');
    this.edgeLayer.setAttribute('role', 'group');
    this.stage.appendChild(this.edgeLayer);
  }

  private card(parent: HTMLElement, entry: Entry, focus: Set<string> | null, compact = false): HTMLElement {
    const source = this.plugin.entries.get(entry.path) ?? entry;
    const end = entryEnd(entry); const range = entry.date === end ? entry.date : `${entry.date} through ${end}`;
    const card = parent.createDiv({ cls: 'jsp-card', attr: { tabindex: '0', 'data-path': entry.path, 'data-date': entry.date, 'data-end-date': end, 'aria-label': `${entry.title}, ${range}` } });
    card.toggleClass('is-multi-day', end !== entry.date);
    card.toggleClass('is-selected', this.selected.has(entry.path));
    card.toggleClass('is-dimmed', focus !== null && !focus.has(entry.path));
    card.toggleClass('is-compact', compact);
    const hasBody = Boolean(entry.body.trim());
    card.toggleClass('is-title-only', !hasBody);
    card.title = `${entry.title} · ${range}`;
    this.allCards.add(card);
    if (!this.renderedCards.has(entry.path) || entry.date === (entry.occurrence?.sourceDate ?? entry.date)) this.renderedCards.set(entry.path, card);
    const heading = card.createDiv({ cls: 'jsp-card-heading' });
    heading.createEl('strong', { text: entry.title });
    if (entry.occurrence) {
      const o = entry.occurrence;
      card.dataset.scheduleKind = o.kind; card.dataset.sourceDate = o.sourceDate;
      const label = o.kind === 'repeat' ? 'Repeats · opens the same note' : o.kind === 'additional' ? 'Additional date · opens the same note' : end !== entry.date ? 'Multi-day note' : '';
      card.title = [entry.title, entry.date === o.end ? entry.date : `${entry.date} through ${o.end}`, label, ...o.warnings, ...(o.limited ? ['Limited to 500 appearances in this window'] : [])].filter(Boolean).join(' · ');
      if (label || o.warnings.length || o.limited) {
        const badge = heading.createSpan({ cls: 'jsp-schedule-indicator', attr: { title: card.title, 'aria-label': [label, ...o.warnings].filter(Boolean).join(' · ') } });
        setIcon(badge, o.warnings.length || o.limited ? 'triangle-alert' : o.kind === 'repeat' ? 'repeat' : o.kind === 'additional' ? 'calendar-plus' : 'calendar-range');
      }
      card.toggleClass('has-schedule-warning', Boolean(o.warnings.length || o.limited));
    }
    const menu = heading.createEl('button', { cls: 'jsp-card-menu', attr: { title: 'Entry actions', 'aria-label': `Actions for ${entry.title}` } });
    setIcon(menu, 'ellipsis');
    menu.addEventListener('click', event => { event.stopPropagation(); this.entryMenu(event, entry); });
    if (this.mode === 'notebook' && end !== entry.date) card.createDiv({ cls: 'jsp-card-date-range', text: range });
    if (!compact) {
      if (hasBody) {
        const body = card.createDiv({ cls: 'jsp-card-body markdown-rendered' });
        void MarkdownRenderer.render(this.app, entry.body, body, entry.path, this.renderComponent!).then(() => {
          // Preview checkboxes must not become an accidental second editing surface.
          body.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.disabled = true; });
        }).catch(error => { console.error('Just Simple Planner: render failed', error); body.setText(entry.body); });
      }
      const count = tasks(entry.body);
      const bottom = card.createDiv({ cls: 'jsp-card-bottom' });
      if (count.length) bottom.createSpan({ text: `${count.filter(task => task.checked).length}/${count.length} tasks` });
      const add = bottom.createEl('button', { attr: { title: 'Add connected entry', 'aria-label': `Continue ${entry.title}` } });
      setIcon(add, 'arrow-right');
      add.addEventListener('click', event => { event.stopPropagation(); this.plugin.newEntry(shiftDay(source.date, 1), source.thread, source.path); });
    }
    const outside = this.plugin.outsideLinks?.(entry) ?? 0;
    if (outside) card.createSpan({ cls: 'jsp-outside-links', text: `↗ ${outside}`, attr: { title: `${outside} connected entries outside this Base. Whole-flow moves are unavailable until those entries are included.` } });
    if (this.mode === 'board') {
      const handle = card.createEl('button', { cls: 'jsp-connection-handle', attr: { type: 'button', draggable: 'false', title: 'Drag to another entry to connect', 'aria-label': `Connect from ${entry.title}` } });
      setIcon(handle, 'plus');
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || this.dragging || this.panning || this.linking) return;
        event.preventDefault(); event.stopPropagation();
        this.linking = { pointerId: event.pointerId, source: entry.path, target: null, sourceCard: card, targetCard: null, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
        this.root.addClass('jsp-connecting'); card.addClass('is-connection-source');
        this.connectionPreview = document.createElementNS(SVG, 'svg');
        this.connectionPreview.classList.add('jsp-connection-preview');
        this.connectionPreview.setAttribute('aria-hidden', 'true');
        this.stage.appendChild(this.connectionPreview);
        this.scroll.focus({ preventScroll: true });
        try { this.scroll.setPointerCapture(event.pointerId); }
        catch { /* Synthetic pointers may not be capturable. */ }
        this.updateConnection();
      });
      handle.addEventListener('dragstart', event => { event.preventDefault(); event.stopPropagation(); });
      handle.addEventListener('click', event => {
        event.stopPropagation();
        if (this.root.win.performance.now() < this.suppressConnectorClickUntil) return;
        new ConnectModal(this.app, this.plugin, entry).open();
      });
    }
    card.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('a, button')) return;
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey) { if (this.selected.has(entry.path)) this.selected.delete(entry.path); else this.selected.add(entry.path); }
      else this.selected = new Set([entry.path]);
      this.activeThread = entry.thread;
      this.updateSelection(); card.focus();
    });
    card.addEventListener('dblclick', event => {
      if ((event.target as HTMLElement).closest('a, button')) return;
      event.stopPropagation(); this.plugin.editEntry(entry);
    });
    card.addEventListener('contextmenu', event => { event.preventDefault(); this.entryMenu(event, entry); });
    card.addEventListener('mouseover', event => {
      if (this.linking || this.panning || (!event.ctrlKey && !event.metaKey)) return;
      this.app.workspace.trigger('hover-link', { event, source: VIEW_TYPE, hoverParent: this, targetEl: card, linktext: entry.path, sourcePath: entry.path });
    });
    if (this.mode === 'board' && (this.plugin.canMove?.(entry) ?? true)) {
      card.draggable = true;
      card.addEventListener('dragstart', event => {
        if (this.linking || this.panning || (event.target as HTMLElement).closest('a, button')) { event.preventDefault(); return; }
        const paths = event.shiftKey ? this.flowPaths([entry.path]) : this.selected.has(entry.path) ? new Set(this.selected) : new Set([entry.path]);
        if (!paths.size) { event.preventDefault(); return; }
        const rect = card.getBoundingClientRect();
        const dayOffset = end !== entry.date && event.clientX >= rect.left && event.clientX <= rect.right
          ? Math.max(0, Math.min(dayNumber(end) - dayNumber(entry.date), Math.floor((event.clientX - parent.getBoundingClientRect().left) / this.plugin.settings.dayWidth) - (dayNumber(entry.date) - dayNumber(this.firstDay)))) : 0;
        this.dragging = { path: entry.path, entries: new Map(this.plugin.entries), paths, dayOffset };
        this.dropped = false;
        event.dataTransfer!.setData('application/x-just-simple-planner', entry.path);
        event.dataTransfer!.effectAllowed = 'move';
        card.addClass('is-dragging');
      });
      card.addEventListener('dragend', () => { this.dragging = null; if (!this.dropped) this.render(); });
    }
    return card;
  }

  private updateSelection(): void {
    for (const card of this.allCards) card.toggleClass('is-selected', this.selected.has(card.dataset.path!));
    this.updateFooter();
  }

  private isExternalNoteDrag(event: DragEvent): boolean {
    const types = Array.from(event.dataTransfer?.types ?? []);
    return !this.dragging && !types.includes('application/x-just-simple-planner') && types.some(type => type === 'text/plain' || type === 'text/uri-list');
  }

  private bindNoteDrop(target: HTMLElement, row: Thread | null, dated: boolean): void {
    const clear = (): void => { target.removeClass('is-note-drop-target'); target.querySelector(':scope > .jsp-drop-preview')?.remove(); };
    const destination = (event: DragEvent): string | undefined => {
      if (!dated) return undefined;
      const index = Math.floor((event.clientX - target.getBoundingClientRect().left) / this.plugin.settings.dayWidth);
      return index >= 0 && index < DAYS ? shiftDay(this.firstDay, index) : undefined;
    };
    target.addEventListener('dragover', event => {
      if (!this.isExternalNoteDrag(event) || !event.dataTransfer) return;
      const date = destination(event);
      if (dated && !date) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy';
      target.addClass('is-note-drop-target');
      let preview = target.querySelector<HTMLElement>(':scope > .jsp-drop-preview');
      if (!preview) preview = target.createDiv({ cls: 'jsp-drop-preview', attr: { role: 'status' } });
      preview.setText('Add note' + (row ? ' to ' + row.title : ' to planner') + ' · ' + (date ? 'propose ' + date : 'keep its existing date') + '. Review before saving; the file stays in place.');
      if (dated) {
        const index = Math.floor((event.clientX - target.getBoundingClientRect().left) / this.plugin.settings.dayWidth);
        preview.style.left = (index * this.plugin.settings.dayWidth + 4) + 'px';
        preview.style.width = (this.plugin.settings.dayWidth - 8) + 'px';
      }
    });
    target.addEventListener('dragleave', event => { if (!target.contains(event.relatedTarget as Node | null)) clear(); });
    target.addEventListener('drop', event => {
      if (this.dragging || !event.dataTransfer || Array.from(event.dataTransfer.types).includes('application/x-just-simple-planner')) return;
      event.preventDefault(); event.stopPropagation(); clear(); this.root.removeClass('jsp-importing');
      const date = destination(event);
      if (dated && !date) return;
      const file = this.plugin.droppedNote(event.dataTransfer);
      if (!file) { new Notice('Drop one existing Markdown note from this vault. Files are not imported or copied.'); return; }
      void this.plugin.perform(() => this.plugin.reviewNote(file, { thread: row?.path ?? '', date }));
    });
  }

  private drop(event: DragEvent, lane: HTMLElement, row: Thread): void {
    if (!this.dragging) return;
    event.preventDefault();
    const drag = this.dragging;
    this.dragging = null; this.dropped = true;
    const origin = drag.entries.get(drag.path)!;
    const index = Math.floor((event.clientX - lane.getBoundingClientRect().left) / this.plugin.settings.dayWidth);
    if (index < 0 || index >= DAYS) { this.render(); return; }
    if (drag.paths.size > 1 && row.path !== origin.thread) { new Notice('Move a single entry to change its thread. A flow keeps its original threads.'); this.render(); return; }
    const destination = shiftDay(this.firstDay, index - drag.dayOffset);
    const delta = dayNumber(destination) - dayNumber(origin.date);
    const moves = dateMoves(drag.entries, drag.paths, delta);
    const patches = [...moves].map(([path, date]) => ({ path, expectedText: drag.entries.get(path)!.snapshot, expectedDate: drag.entries.get(path)!.date, fields: { date, ...(drag.paths.size === 1 && row.path !== origin.thread ? { thread: row.path === 'unassigned' ? '' : row.path.startsWith('text:') ? row.path.slice(5) : this.plugin.link(row.path) } : {}) } }));
    if (!delta && row.path === origin.thread) { this.render(); return; }
    void this.plugin.perform(() => this.plugin.patch(patches));
  }

  private renderNotebook(rows: Thread[], entries: Entry[]): void {
    this.edgeLayer = null;
    const notebook = this.scroll.createDiv({ cls: 'jsp-notebook' });
    const sidebar = notebook.createDiv({ cls: 'jsp-notebook-threads' });
    if (!rows.some(row => row.path === this.activeThread)) this.activeThread = rows[0]?.path ?? '';
    for (const row of rows) {
      const button = sidebar.createEl('button', { text: row.title });
      this.bindNoteDrop(button, row, false);
      button.toggleClass('is-active', row.path === this.activeThread);
      button.addEventListener('click', () => { this.activeThread = row.path; this.render(); });
    }
    const content = notebook.createDiv({ cls: 'jsp-notebook-content' });
    const row = rows.find(row => row.path === this.activeThread);
    if (!row) return;
    this.bindNoteDrop(content, row, false);
    content.style.setProperty('--jsp-thread-color', this.color(row));
    content.createEl('h2', { text: row.title });
    this.button(content, 'New entry', 'plus', () => this.plugin.newEntry(today(), row.path));
    const focus = this.focusPath ? spotlight(this.plugin.entries, this.focusPath) : null;
    const finalDay = shiftDay(this.firstDay, DAYS - 1);
    if (this.plugin.schedulingEnabled) content.createEl('p', { cls: 'jsp-schedule-window', text: `Scheduled appearances: ${this.firstDay} through ${finalDay}. Use the date navigation to change this window.` });
    const appearances = this.plugin.projectEntries?.(entries, this.firstDay, finalDay, true) ?? entries;
    const order = new Map(entries.map((entry, index) => [entry.path, index]));
    const ordered = appearances.filter(entry => entry.thread === row.path).sort((a, b) => a.date.localeCompare(b.date) || (this.plugin.queryOrder ? order.get(a.path)! - order.get(b.path)! : a.title.localeCompare(b.title)));
    let date = '';
    for (const entry of ordered) {
      if (date !== entry.date) { date = entry.date; content.createEl('h3', { text: date, attr: { 'data-date': date } }); }
      this.card(content, entry, focus);
    }
  }

  private renderTasks(entries: Entry[], rows: Thread[]): void {
    this.rail.createEl('h3', { text: 'Pending tasks' });
    this.rail.createEl('p', { cls: 'jsp-task-help', text: 'Grouped by entry date. Dates are not separate task deadlines.' });
    const visible = new Set(rows.map(row => row.path));
    const pending = entries.filter(entry => visible.has(entry.thread)).flatMap(entry => tasks(entry.body).filter(task => !task.checked).map(task => ({ entry, task }))).sort((a, b) => a.entry.date.localeCompare(b.entry.date));
    let group = '';
    for (const { entry, task } of pending) {
      const next = entry.date < today() ? 'Earlier entries' : entry.date === today() ? 'Today' : 'Upcoming';
      if (next !== group) { group = next; this.rail.createEl('h4', { text: group }); }
      const item = this.rail.createDiv({ cls: 'jsp-task' });
      const checkbox = item.createEl('input', { attr: { type: 'checkbox', 'aria-label': `Complete ${task.text}` } });
      const text = item.createDiv();
      text.createDiv({ text: task.text });
      const link = text.createEl('button', { cls: 'jsp-task-source', text: `${entry.date} · ${entry.title}` });
      link.addEventListener('click', () => { this.selected = new Set([entry.path]); this.activeThread = entry.thread; this.jump(entry.date); });
      checkbox.addEventListener('change', () => { checkbox.disabled = true; void this.plugin.perform(() => this.plugin.toggleEntryTask(entry, task.line, checkbox.checked)); });
    }
    if (!pending.length) this.rail.createEl('p', { text: 'No pending tasks in the current filter.' });
  }

  private entryMenu(event: MouseEvent, entry: Entry): void {
    entry = this.plugin.entries.get(entry.path) ?? entry;
    const menu = new Menu();
    menu.addItem(item => item.setTitle('Edit entry').setIcon('pencil').onClick(() => this.plugin.editEntry(entry)));
    menu.addItem(item => item.setTitle('Open note to the right').setIcon('panel-right').onClick(() => { void this.plugin.perform(() => this.app.workspace.getLeaf('split', 'vertical').openFile(this.plugin.file(entry.path))); }));
    menu.addItem(item => item.setTitle('Add connected entry').setIcon('arrow-right').onClick(() => this.plugin.newEntry(shiftDay(entry.date, 1), entry.thread, entry.path)));
    menu.addItem(item => item.setTitle('Connect to…').setIcon('link').onClick(() => new ConnectModal(this.app, this.plugin, entry).open()));
    if (entry.next.length) for (const next of entry.next) menu.addItem(item => item.setTitle(`Disconnect ${this.plugin.entries.get(next)?.title ?? next}`).setIcon('unlink').onClick(() => { void this.plugin.perform(() => this.plugin.connect(entry.path, next, true)); }));
    menu.addSeparator();
    menu.addItem(item => item.setTitle('Select connected flow').setIcon('workflow').onClick(() => { this.selected = this.flowPaths([entry.path]); this.updateSelection(); }));
    menu.addItem(item => item.setTitle('Spotlight').setIcon('focus').onClick(() => { this.focusPath = entry.path; this.render(); }));
    this.plugin.scheduleMenu?.(menu, entry);
    menu.addSeparator();
    if (!this.plugin.basesMode) menu.addItem(item => item.setTitle('Remove note from planner…').setIcon('minus-circle').onClick(() => { void this.plugin.perform(() => this.plugin.reviewNote(this.plugin.file(entry.path), { remove: true })); }));
    menu.showAtMouseEvent(event);
  }

  private threadMenu(event: MouseEvent, row: Thread): void {
    if (!this.plugin.threads.has(row.path)) return;
    const menu = new Menu();
    for (const status of ['active', 'parked', 'closed']) menu.addItem(item => item.setTitle(`Set ${status}`).setChecked(row.status === status).onClick(() => { void this.plugin.perform(() => this.plugin.patch([{ path: row.path, fields: { status } }])); }));
    menu.addSeparator();
    for (const direction of [-1, 1]) menu.addItem(item => item.setTitle(direction === -1 ? 'Move thread up' : 'Move thread down').onClick(() => {
      const rows = this.plugin.rows(); const index = rows.findIndex(item => item.path === row.path); const other = rows[index + direction];
      if (!other || !this.plugin.threads.has(other.path)) return;
      void this.plugin.perform(() => this.plugin.patch([{ path: row.path, fields: { order: index + direction } }, { path: other.path, fields: { order: index } }]));
    }));
    menu.showAtMouseEvent(event);
  }

  private onKey(event: KeyboardEvent): void {
    if (this.linking) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.finishConnection(false); }
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
    const selected = [...this.selected].map(path => this.plugin.entries.get(path)).filter((entry): entry is Entry => !!entry);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); void this.plugin.perform(() => event.shiftKey ? this.plugin.history.redo() : this.plugin.history.undo()); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); void this.plugin.perform(() => this.plugin.history.redo()); }
    else if (event.key === 'Escape') { event.preventDefault(); this.selected.clear(); this.focusPath = null; this.render(); }
    else if (selected.length === 1 && event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); this.plugin.newEntry(shiftDay(selected[0].date, 1), selected[0].thread, selected[0].path); }
    else if (selected.length === 1 && (event.key === 'Enter' || event.key === 'F2')) { event.preventDefault(); this.plugin.editEntry(selected[0]); }
    else if (selected.length && (event.ctrlKey || event.metaKey) && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); const delta = event.key === 'ArrowRight' ? 1 : -1;
      void this.plugin.perform(() => this.plugin.patch(selected.map(entry => ({ path: entry.path, expectedDate: entry.date, fields: { date: shiftDay(entry.date, delta) } }))));
    }
  }

  private onScroll(): void {
    if (!this.scroll.clientWidth) { this.renderPending = true; return; }
    if (this.linking) { this.updateConnection(); return; }
    if (this.scrolling || this.dragging || this.panning) return;
    if (this.mode !== 'board') { this.persistState(); return; }
    const width = this.plugin.settings.dayWidth;
    const left = this.scroll.scrollLeft;
    const end = this.scroll.scrollWidth - this.scroll.clientWidth;
    if (left < 5 * width) { this.firstDay = shiftDay(this.firstDay, -21); this.render(); this.scroll.scrollLeft = left + 21 * width; }
    else if (end - left < 5 * width) { this.firstDay = shiftDay(this.firstDay, 21); this.render(); this.scroll.scrollLeft = left - 21 * width; }
    this.persistState();
  }

  private queueEdges(): void {
    if (!this.root || this.drawFrame) return;
    this.drawFrame = this.root.win.requestAnimationFrame(() => { this.drawFrame = 0; this.drawEdges(); });
  }

  private configureConnections(): void {
    this.registerDomEvent(this.scroll, 'pointermove', event => {
      const link = this.linking;
      if (!link || event.pointerId !== link.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      link.x = event.clientX; link.y = event.clientY;
      link.moved ||= Math.hypot(link.x - link.startX, link.y - link.startY) >= 4;
      this.updateConnection(); this.scheduleConnectionScroll();
    });
    this.registerDomEvent(this.scroll, 'pointerup', event => {
      if (!this.linking || event.pointerId !== this.linking.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      this.linking.x = event.clientX; this.linking.y = event.clientY;
      this.updateConnection(); this.finishConnection(true);
    });
    for (const name of ['pointercancel', 'lostpointercapture'] as const) this.registerDomEvent(this.scroll, name, event => {
      if (this.linking?.pointerId === event.pointerId) this.finishConnection(false);
    });
    this.registerDomEvent(this.root.win, 'blur', () => { if (this.linking) this.finishConnection(false); });
  }

  private updateConnection(): void {
    const link = this.linking;
    const preview = this.connectionPreview;
    const source = link?.sourceCard;
    if (!link || !preview || !source) return;
    const viewport = this.scroll.getBoundingClientRect();
    const inside = link.x >= viewport.left && link.x < viewport.right && link.y >= viewport.top && link.y < viewport.bottom;
    const hit = inside ? this.root.doc.elementFromPoint(link.x, link.y)?.closest<HTMLElement>('.jsp-card') : null;
    const candidate = hit?.dataset.path;
    link.target = candidate && candidate !== link.source && hit && this.allCards.has(hit) && this.plugin.entries.has(candidate) ? candidate : null;
    link.targetCard = link.target ? hit ?? null : null;
    for (const card of this.allCards) card.toggleClass('is-connection-target', card === link.targetCard);
    const stage = this.stage.getBoundingClientRect();
    const from = source.getBoundingClientRect();
    const target = link.targetCard?.getBoundingClientRect() ?? null;
    const x1 = from.right - stage.left; const y1 = from.top + from.height / 2 - stage.top;
    const forward = target ? target.left >= from.right : link.x >= from.right;
    const x2 = (target ? forward ? target.left : target.right : link.x) - stage.left;
    const y2 = (target ? target.top + target.height / 2 : link.y) - stage.top;
    const bend = Math.max(35, Math.min(140, Math.abs(x2 - x1) / 2));
    preview.setAttribute('width', String(this.stage.scrollWidth)); preview.setAttribute('height', String(this.stage.scrollHeight));
    preview.replaceChildren();
    const line = document.createElementNS(SVG, 'path');
    line.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - (forward ? bend : -bend)} ${y2}, ${x2} ${y2}`);
    line.setAttribute('class', `jsp-preview-line${target ? ' has-target' : ''}`);
    preview.appendChild(line);
    const arrow = document.createElementNS(SVG, 'path');
    arrow.setAttribute('d', forward ? `M ${x2 - 7} ${y2 - 5} L ${x2} ${y2} L ${x2 - 7} ${y2 + 5}` : `M ${x2 + 7} ${y2 - 5} L ${x2} ${y2} L ${x2 + 7} ${y2 + 5}`);
    arrow.setAttribute('class', 'jsp-preview-arrow'); preview.appendChild(arrow);
  }

  private scheduleConnectionScroll(): void {
    if (this.connectionFrame || !this.linking) return;
    this.connectionFrame = this.root.win.requestAnimationFrame(() => {
      this.connectionFrame = 0;
      const link = this.linking;
      if (!link) return;
      const rect = this.scroll.getBoundingClientRect();
      if (link.x < rect.left || link.x >= rect.right || link.y < rect.top || link.y >= rect.bottom) return;
      const dx = link.x > rect.right - 28 ? 12 : link.x < rect.left + LABEL + 28 ? -12 : 0;
      const dy = link.y > rect.bottom - 28 ? 10 : link.y < rect.top + 90 ? -10 : 0;
      const left = this.scroll.scrollLeft; const top = this.scroll.scrollTop;
      this.scroll.scrollLeft += dx; this.scroll.scrollTop += dy;
      if (left !== this.scroll.scrollLeft || top !== this.scroll.scrollTop) { this.updateConnection(); this.scheduleConnectionScroll(); }
    });
  }

  private finishConnection(commit: boolean, render = true): void {
    const link = this.linking;
    if (!link) return;
    this.linking = null;
    if (this.connectionFrame) this.root.win.cancelAnimationFrame(this.connectionFrame);
    this.connectionFrame = 0;
    this.connectionPreview?.remove(); this.connectionPreview = null;
    this.root.removeClass('jsp-connecting');
    for (const card of this.allCards) card.removeClass('is-connection-source', 'is-connection-target');
    if (this.scroll.hasPointerCapture(link.pointerId)) this.scroll.releasePointerCapture(link.pointerId);
    if (link.moved || !commit) this.suppressConnectorClickUntil = this.root.win.performance.now() + 300;
    if (commit && link.moved && link.target) void this.plugin.perform(() => this.plugin.connect(link.source, link.target!));
    else if (render) this.render();
  }

  private drawEdges(): void {
    if (!this.edgeLayer || !this.stage || this.mode !== 'board') return;
    this.edgeLayer.replaceChildren();
    const rect = this.stage.getBoundingClientRect();
    this.edgeLayer.setAttribute('width', String(this.stage.scrollWidth));
    this.edgeLayer.setAttribute('height', String(this.stage.scrollHeight));
    const focus = this.focusPath ? spotlight(this.plugin.entries, this.focusPath) : null;
    for (const entry of this.plugin.entries.values()) {
      const from = this.renderedCards.get(entry.path);
      if (!from) continue;
      for (const path of entry.next) {
        const to = this.renderedCards.get(path);
        if (!to) continue;
        const a = from.getBoundingClientRect(); const b = to.getBoundingClientRect();
        const forward = b.left >= a.right;
        const x1 = a.right - rect.left; const y1 = a.top + a.height / 2 - rect.top;
        const x2 = (forward ? b.left : b.right) - rect.left; const y2 = b.top + b.height / 2 - rect.top;
        const bend = Math.max(35, Math.min(140, Math.abs(x2 - x1) / 2));
        const group = document.createElementNS(SVG, 'g');
        group.classList.add('jsp-connection');
        group.dataset.source = entry.path; group.dataset.target = path;
        this.edgeLayer.appendChild(group);
        const hit = document.createElementNS(SVG, 'path');
        hit.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - (forward ? bend : -bend)} ${y2}, ${x2} ${y2}`);
        hit.setAttribute('class', 'jsp-edge-hit'); group.appendChild(hit);
        const element = document.createElementNS(SVG, 'path');
        element.setAttribute('d', hit.getAttribute('d')!);
        element.setAttribute('class', `jsp-edge${focus && (!focus.has(entry.path) || !focus.has(path)) ? ' is-dimmed' : ''}`);
        element.style.stroke = this.color(this.plugin.rows().find(row => row.path === entry.thread)!);
        group.appendChild(element);
        const arrow = document.createElementNS(SVG, 'path');
        arrow.setAttribute('d', forward ? `M ${x2 - 6} ${y2 - 4} L ${x2} ${y2} L ${x2 - 6} ${y2 + 4}` : `M ${x2 + 6} ${y2 - 4} L ${x2} ${y2} L ${x2 + 6} ${y2 + 4}`);
        arrow.setAttribute('class', element.getAttribute('class')!); arrow.style.stroke = element.style.stroke;
        group.appendChild(arrow);
        const remove = document.createElementNS(SVG, 'g');
        remove.classList.add('jsp-edge-remove');
        const middleX = (x1 + 3 * (x1 + bend) + 3 * (x2 - (forward ? bend : -bend)) + x2) / 8;
        remove.setAttribute('transform', `translate(${middleX} ${(y1 + y2) / 2})`);
        // Obsidian's aria-label tooltips expect an HTMLElement with isShown().
        // Keep the control in HTML rather than making the SVG group a button.
        const foreign = document.createElementNS(SVG, 'foreignObject');
        foreign.setAttribute('x', '-11'); foreign.setAttribute('y', '-11');
        foreign.setAttribute('width', '22'); foreign.setAttribute('height', '22');
        const button = foreign.createEl('button');
        button.type = 'button'; button.className = 'jsp-edge-disconnect';
        button.setAttribute('aria-label', `Disconnect ${entry.title} from ${this.plugin.entries.get(path)?.title ?? path}`);
        button.title = 'Disconnect'; setIcon(button, 'x');
        remove.appendChild(foreign);
        const disconnect = (): void => { void this.plugin.perform(() => this.plugin.connect(entry.path, path, true)); };
        button.addEventListener('pointerdown', event => { if (event.button === 0) { event.preventDefault(); event.stopPropagation(); } });
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); disconnect(); });
        group.addEventListener('contextmenu', event => { event.preventDefault(); const menu = new Menu(); menu.addItem(item => item.setTitle('Disconnect').setIcon('unlink').onClick(disconnect)); menu.showAtMouseEvent(event); });
        group.appendChild(remove);
      }
    }
  }
}

/** Preserve the existing workspace type and commands throughout the transition. */
export class PlannerView extends ItemView {
  surface!: PlannerSurface;
  constructor(leaf: WorkspaceLeaf, private readonly plugin: JustSimplePlanner) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Just Simple Planner (classic)'; }
  getIcon(): string { return PLANNER_ICON; }
  async onOpen(): Promise<void> {
    await this.plugin.reloadIndex();
    this.surface = this.addChild(new PlannerSurface(this.app, this.contentEl, this.plugin));
  }
  async onClose(): Promise<void> { if (this.surface) { this.removeChild(this.surface); this.surface.unload(); } this.plugin.classicViewClosed(this.leaf); }
  getState(): Record<string, unknown> { return this.surface?.getState() ?? {}; }
  async setState(state: Record<string, unknown>): Promise<void> { await this.surface?.setState(state); }
  render(): void { this.surface?.render(); }
  revealEntry(entry: Entry): void { this.surface?.revealEntry(entry); }
}
