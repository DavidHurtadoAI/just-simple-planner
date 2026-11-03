import { dayNumber, shiftDay, validDay, type Entry, type Thread } from './model.ts';
import type { PlannerSettings } from './settings';

export const BASES_VIEW_TYPE = 'just-simple-planner-bases';

/** A note's anchor uses its written calendar day, including datetime notes. */
export function noteDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)$/.exec(text);
  return match && validDay(match[1]) ? match[1] : null;
}

export function movedNoteDates(start: unknown, end: unknown, destination: string): { start: string; end?: string } {
  const first = noteDay(start);
  if (!first || !validDay(destination)) throw new Error('Choose a valid note date.');
  const suffix = (start as string).trim().slice(10);
  if (end === undefined || end === null || end === '') return { start: destination + suffix };
  const last = noteDay(end);
  if (!last || last < first) throw new Error('Repair the end date before moving this note.');
  return { start: destination + suffix, end: shiftDay(last, dayNumber(destination) - dayNumber(first)) + (end as string).trim().slice(10) };
}

/** Compare the meaning of both views without copying note bodies into a Base. */
export function plannerSignature(entries: Iterable<Entry>, threads: Iterable<Thread>): string {
  const content = JSON.stringify({
    entries: [...entries].map(e => [e.path, e.title, e.date, e.thread, [...e.next].sort()]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    threads: [...threads].map(t => [t.path, t.title, t.status, t.color, t.order]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) { hash ^= content.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface MigrationRecord {
  schema: number;
  signature: string;
  entries: string[];
  threads: string[];
  invalid: string[];
  sourceEntryFolder: string;
  sourceThreadFolder: string;
}

export function migrationDocument(settings: PlannerSettings, entries: Iterable<Entry>, threads: Iterable<Thread>, invalid: Iterable<string>, state: Record<string, unknown> = {}): Record<string, unknown> {
  const cards = [...entries]; const rows = [...threads];
  const migration: MigrationRecord = {
    schema: 1, signature: plannerSignature(cards, rows), entries: cards.map(e => e.path).sort(), threads: rows.map(t => t.path).sort(), invalid: [...invalid].sort(),
    sourceEntryFolder: settings.entryFolder, sourceThreadFolder: settings.threadFolder,
  };
  return {
    filters: { or: ['note.planner_type == "entry"', 'note.planner_type == "thread"'] },
    views: [{ type: BASES_VIEW_TYPE, name: 'Planner',
      dateProperty: `note.${settings.propertyNames.date}`, titleProperty: `note.${settings.propertyNames.title}`,
      threadProperty: `note.${settings.propertyNames.thread}`, nextProperty: `note.${settings.propertyNames.next}`,
      dayWidth: String(settings.dayWidth), threadNotes: rows.map(t => t.path), plannerState: state, migration,
    }],
  };
}
