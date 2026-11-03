/** Local scheduling semantics matching Just Simple Calendar. No runtime plugin dependency. */
export function localDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function dayKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** ISO date strings and datetimes use their written calendar day. */
export function parseDay(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$)/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = localDate(Number(y), Number(m) - 1, Number(d));
  const key = `${y}-${m}-${d}`;
  return dayKey(date) === key ? key : null;
}

export function addDays(date: Date, days: number): Date {
  return localDate(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function dateRange(start: string, end: string | null): { start: string; end: string; invalidEnd: boolean } | null {
  const first = parseDay(start);
  if (!first) return null;
  if (end === null || end.trim() === '') return { start: first, end: first, invalidEnd: false };
  const last = parseDay(end);
  if (!last || last < first) return { start: first, end: first, invalidEnd: true };
  return { start: first, end: last, invalidEnd: false };
}

export type RepeatRule = { unit: 'day' | 'week' | 'month' | 'year'; interval: number };
export interface CalendarSpan { start: string; end: string }

/** Deliberately bounded grammar, shared by note properties and the documentation. */
export function repeatRule(value: string): RepeatRule | null {
  const text = value.trim().toLowerCase();
  const compact = /^([dwmy])([1-9]\d{0,3})?$/.exec(text);
  if (compact) return { unit: ({ d: 'day', w: 'week', m: 'month', y: 'year' } as const)[compact[1] as 'd' | 'w' | 'm' | 'y'], interval: Number(compact[2] ?? 1) };
  const words = /^every (?:(second|third|fourth|[1-9]\d{0,3}) )?(day|week|month|year)s?$/.exec(text);
  if (words) return { unit: words[2] as RepeatRule['unit'], interval: Number(({ second: 2, third: 3, fourth: 4 } as Record<string, number>)[words[1]] ?? words[1] ?? 1) };
  const single = /^(daily|weekly|monthly|yearly)$/.exec(text);
  return single ? { unit: ({ daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const)[single[1] as 'daily' | 'weekly' | 'monthly' | 'yearly'], interval: 1 } : null;
}

function serialDay(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() / 86400000;
}

/** Project occurrences into the loaded window; never create or modify notes.
 * Month/year repeats clamp to that month's last day, always from the original
 * anchor (Jan 31 -> Feb 28 -> Mar 31). The duration is in local calendar days.
 */
export function repeatSpans(span: CalendarSpan, rule: RepeatRule, first: string, last: string, until?: string, except: ReadonlySet<string> = new Set(), startsOnly = false): { spans: CalendarSpan[]; limited: boolean } {
  if (!parseDay(span.start) || !parseDay(span.end) || !parseDay(first) || !parseDay(last) || span.end < span.start || last < first || !Number.isInteger(rule.interval) || rule.interval < 1) return { spans: [], limited: false };
  const duration = serialDay(span.end) - serialDay(span.start);
  const lookback = startsOnly ? 0 : duration;
  const [y, m, d] = span.start.split('-').map(Number);
  const earliest = addDays(localDate(y, m - 1, d), serialDay(first) - lookback - serialDay(span.start));
  const step = rule.interval * (rule.unit === 'week' ? 7 : 1);
  let index = Math.max(0, Math.floor(rule.unit === 'day' || rule.unit === 'week'
    ? (serialDay(first) - lookback - serialDay(span.start)) / step
    : rule.unit === 'month' ? ((earliest.getFullYear() - y) * 12 + earliest.getMonth() - m + 1) / step
    : (earliest.getFullYear() - y) / step) - 1);
  const spans: CalendarSpan[] = [];
  for (;; index++) {
    const date = rule.unit === 'day' || rule.unit === 'week' ? addDays(localDate(y, m - 1, d), index * step)
      : (() => {
        const month = localDate(y + (rule.unit === 'year' ? index * step : 0), m - 1 + (rule.unit === 'month' ? index * step : 0), 1);
        return localDate(month.getFullYear(), month.getMonth(), Math.min(d, localDate(month.getFullYear(), month.getMonth() + 1, 0).getDate()));
      })();
    const start = dayKey(date);
    if (!parseDay(start) || start > last || (until && start > until)) break;
    const end = dayKey(addDays(date, duration));
    if (!parseDay(end)) break;
    if ((startsOnly ? start < first : end < first) || except.has(start)) continue;
    if (spans.length === 500) return { spans, limited: true };
    spans.push({ start, end });
  }
  return { spans, limited: false };
}

export const DATE_LIST_LIMIT = 128;

/** A list always means individual ISO calendar days, never a range or a rule. */
export function dateList(value: unknown): { days: string[]; invalid: number; limited: boolean } {
  if (value === undefined || value === null || value === '') return { days: [], invalid: 0, limited: false };
  const values = Array.isArray(value) ? value : [value];
  const days = new Set<string>();
  let invalid = 0;
  for (const item of values.slice(0, DATE_LIST_LIMIT)) {
    if (typeof item === 'string' && parseDay(item) === item.trim()) days.add(item.trim());
    else invalid++;
  }
  return { days: [...days].sort(), invalid, limited: values.length > DATE_LIST_LIMIT };
}

export interface ScheduleOptions { until?: unknown; except?: unknown; additional?: unknown; startsOnly?: boolean }
export interface ScheduleProjection {
  spans: CalendarSpan[];
  kind: 'single' | 'repeat' | 'additional';
  invalidEnd: boolean;
  warnings: string[];
  limited: boolean;
}

/** Keep the three schedules unambiguous: one event, a series, or individual days.
 * Limits apply to occurrence START dates. Invalid bounds never create an
 * accidentally unbounded series; the source event stays visible for repair.
 */
export function projectSchedule(start: string, end: string | null, repeat: string, first: string, last: string, options: ScheduleOptions = {}): ScheduleProjection | null {
  const range = dateRange(start, end);
  if (!range) return null;
  const warnings: string[] = [];
  const extra = dateList(options.additional);
  if (extra.invalid) warnings.push('Invalid additional dates (use YYYY-MM-DD)');
  if (extra.limited) warnings.push('Additional dates limited to 128 values');
  const rule = repeatRule(repeat);
  let spans: CalendarSpan[] = [range];
  let kind: ScheduleProjection['kind'] = 'single';
  let limited = false;
  if (repeat && !rule) warnings.push('Unsupported repeat rule (shown once)');
  if (rule) {
    const until = options.until;
    const hasUntil = until !== undefined && until !== null && until !== '';
    const validUntil = typeof until === 'string' && parseDay(until) === until.trim() && until.trim() >= range.start;
    const except = dateList(options.except);
    if (except.invalid) warnings.push('Invalid skipped dates (use YYYY-MM-DD)');
    if (except.limited) warnings.push('Skipped dates limited to 128 values');
    // A malformed exclusion could silently show a cancelled meeting. Fail closed.
    if (hasUntil && !validUntil || except.invalid || except.limited) {
      warnings.push('Invalid repeat limits (source event shown once)');
    } else {
      const projected = repeatSpans(range, rule, first, last, validUntil ? until.trim() : undefined, new Set(except.days), options.startsOnly);
      spans = projected.spans;
      limited = projected.limited;
      kind = 'repeat';
    }
  }
  if (extra.days.length) {
    if (repeat || range.start !== range.end || range.invalidEnd) {
      warnings.push('Additional dates need a single-day note without repetition');
    } else {
      spans = [...new Set([range.start, ...extra.days])].sort().map(day => ({ start: day, end: day }));
      kind = spans.length > 1 ? 'additional' : 'single';
    }
  }
  return { spans: spans.filter(span => span.start <= last && (options.startsOnly ? span.start >= first : span.end >= first)), kind, invalidEnd: range.invalidEnd, warnings, limited };
}
