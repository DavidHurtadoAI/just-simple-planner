import type { Entry } from './model';
import { dateRange, projectSchedule } from './schedule.ts';

export interface NoteSchedule { start: string; end: string | null; repeat: string; until?: unknown; except?: unknown; additional?: unknown }

/** Appearances share the original file identity, body and snapshot. Never rewrite the note. */
export function noteAppearances(entry: Entry, schedule: NoteSchedule, first: string, last: string, notebook = false): { entries: Entry[]; warnings: string[]; limited: boolean } {
  const result = projectSchedule(schedule.start, schedule.end, schedule.repeat, first, last, schedule);
  if (!result) return { entries: [], warnings: ['Invalid main date'], limited: false };
  const warnings = [...result.warnings, ...(result.invalidEnd ? ['Invalid end date (shown on its start day)'] : [])];
  if (notebook && !schedule.repeat && (schedule.additional === undefined || schedule.additional === null || schedule.additional === '' || Array.isArray(schedule.additional) && !schedule.additional.length)) {
    const end = dateRange(schedule.start, schedule.end)!.end;
    return { entries: [{ ...entry, occurrence: { kind: 'single', sourceDate: entry.date, end, warnings, limited: false } }], warnings, limited: false };
  }
  return {
    entries: result.spans.map(span => ({ ...entry, date: span.start,
      occurrence: { kind: result.kind, sourceDate: entry.date, end: span.end, warnings, limited: result.limited },
    })), warnings, limited: result.limited,
  };
}
