export interface Entry {
  path: string;
  title: string;
  date: string;
  thread: string;
  next: string[];
  body: string;
  snapshot?: string;
}

export interface Thread {
  path: string;
  title: string;
  status: 'active' | 'parked' | 'closed';
  color: string;
  order: number;
}

export interface Change { path: string; before: string; after: string }
export interface TextStore { write(path: string, expected: string, replacement: string): Promise<void> }

export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dayNumber(day: string): number {
  if (!validDay(day)) throw new Error(`Invalid date: ${String(day)}`);
  return Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);
}

export function shiftDay(day: string, count: number): string {
  if (!Number.isInteger(count)) throw new Error('Use whole calendar days.');
  const result = new Date((dayNumber(day) + count) * 86400000).toISOString().slice(0, 10);
  if (!validDay(result)) throw new Error('Date is out of range.');
  return result;
}

export function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function wikiTarget(link: unknown): string | null {
  if (typeof link !== 'string') return null;
  const match = /^\[\[([^\]]+)\]\]$/.exec(link.trim());
  return match ? match[1].split('|')[0].split('#')[0].trim() || null : null;
}

export function connected(entries: ReadonlyMap<string, Entry>, start: Iterable<string>, backwards = false): Set<string> {
  const found = new Set<string>();
  const pending = [...start];
  const reverse = new Map<string, string[]>();
  if (backwards) for (const entry of entries.values()) for (const next of entry.next) {
    reverse.set(next, [...(reverse.get(next) ?? []), entry.path]);
  }
  while (pending.length) {
    const path = pending.pop()!;
    if (found.has(path) || !entries.has(path)) continue;
    found.add(path);
    pending.push(...entries.get(path)!.next, ...(reverse.get(path) ?? []));
  }
  return found;
}

// Spotlight includes ancestors of the selected entry, but not their parallel branches.
export function spotlight(entries: ReadonlyMap<string, Entry>, start: string): Set<string> {
  const ancestors = new Set<string>();
  const pending = [start];
  while (pending.length) {
    const path = pending.pop()!;
    if (ancestors.has(path)) continue;
    ancestors.add(path);
    for (const entry of entries.values()) if (entry.next.includes(path)) pending.push(entry.path);
  }
  return new Set([...ancestors, ...connected(entries, [start])]);
}

export function dateMoves(entries: ReadonlyMap<string, Entry>, paths: Iterable<string>, delta: number): Map<string, string> {
  const result = new Map<string, string>();
  for (const path of paths) {
    const entry = entries.get(path);
    if (entry) result.set(path, shiftDay(entry.date, delta));
  }
  return result;
}

export function stackEntries(entries: Entry[]): { entry: Entry; slot: number }[] {
  const occupied = new Map<string, number>();
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title) || a.path.localeCompare(b.path)).map(entry => {
    const slot = occupied.get(entry.date) ?? 0;
    occupied.set(entry.date, slot + 1);
    return { entry, slot };
  });
}

export function toggleTask(body: string, line: number, checked: boolean): string {
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);
  const current = lines[line];
  if (current === undefined || !/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(current)) throw new Error('Task changed. Reopen the task panel.');
  lines[line] = current.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/, `$1[${checked ? 'x' : ' '}]`);
  return lines.join(newline);
}

export function tasks(body: string): { line: number; text: string; checked: boolean }[] {
  const result: { line: number; text: string; checked: boolean }[] = [];
  let fence: string | null = null;
  body.split(/\r?\n/).forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null; return; }
    if (fence) return;
    const match = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*)/.exec(line);
    if (match) result.push({ line: index, text: match[2], checked: match[1] !== ' ' });
  });
  return result;
}

// Every write compares the current file with the snapshot. Rollback also compares,
// so a failure never silently overwrites a concurrent edit.
export async function applyChanges(store: TextStore, changes: Change[]): Promise<void> {
  const completed: Change[] = [];
  try {
    for (const change of changes) {
      if (change.before === change.after) continue;
      await store.write(change.path, change.before, change.after);
      completed.push(change);
    }
  } catch (error) {
    const failed: string[] = [];
    for (const change of completed.reverse()) {
      try { await store.write(change.path, change.after, change.before); }
      catch { failed.push(change.path); }
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(failed.length ? `${reason} Rollback needs review: ${failed.join(', ')}` : `${reason} Earlier writes were rolled back.`);
  }
}

export class History {
  private undoStack: Change[][] = [];
  private redoStack: Change[][] = [];
  busy = false;
  private readonly store: TextStore;
  constructor(store: TextStore) { this.store = store; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  clear(): void {
    if (this.busy) throw new Error('Wait for the current planner change to finish before changing settings.');
    this.undoStack = []; this.redoStack = [];
  }
  async commit(changes: Change[]): Promise<void> {
    const actual = changes.filter(change => change.before !== change.after);
    if (!actual.length) return;
    await this.run(async () => {
      await applyChanges(this.store, actual);
      this.undoStack.push(actual);
      if (this.undoStack.length > 40) this.undoStack.shift();
      this.redoStack = [];
    });
  }
  async undo(): Promise<void> {
    await this.run(async () => {
      const change = this.undoStack[this.undoStack.length - 1];
      if (!change) return;
      await applyChanges(this.store, [...change].reverse().map(c => ({ path: c.path, before: c.after, after: c.before })));
      this.undoStack.pop(); this.redoStack.push(change);
    });
  }
  async redo(): Promise<void> {
    await this.run(async () => {
      const change = this.redoStack[this.redoStack.length - 1];
      if (!change) return;
      await applyChanges(this.store, change);
      this.redoStack.pop(); this.undoStack.push(change);
    });
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) throw new Error('Another planner change is being saved. Try again.');
    this.busy = true;
    try { await action(); } finally { this.busy = false; }
  }
}
