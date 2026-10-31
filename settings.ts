export interface PropertyNames { date: string; title: string; thread: string; next: string }
export type EntryProperty = keyof PropertyNames;
export interface PlannerSettings {
  entryFolder: string;
  threadFolder: string;
  dayWidth: number;
  propertyNames: PropertyNames;
}

export const DEFAULT_PROPERTIES: Readonly<PropertyNames> = { date: 'date', title: 'title', thread: 'thread', next: 'next' };
export const ENTRY_PROPERTIES: EntryProperty[] = ['date', 'title', 'thread', 'next'];

export function defaultSettings(): PlannerSettings {
  return { entryFolder: 'Planner/Entries', threadFolder: 'Planner/Threads', dayWidth: 190, propertyNames: { ...DEFAULT_PROPERTIES } };
}

export function cloneSettings(settings: PlannerSettings): PlannerSettings { return { ...settings, propertyNames: { ...settings.propertyNames } }; }

export function hasLegacyScope(saved: unknown): boolean {
  return Boolean(saved && typeof saved === 'object' && ['plannerFolder', 'searchFolder', 'searchEntireVault'].some(key => Object.prototype.hasOwnProperty.call(saved, key)));
}

export function loadSettings(saved: unknown): PlannerSettings {
  const result = defaultSettings();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return result;
  const data = saved as Record<string, unknown>;
  for (const [key, child] of [['entryFolder', 'Entries'], ['threadFolder', 'Threads']] as const) {
    if (typeof data.plannerFolder === 'string') {
      const value = typeof data[key] === 'string' ? data[key] : child;
      try {
        result[key] = [cleanFolder(data.plannerFolder), cleanFolder(value)].filter(Boolean).join('/');
      } catch {
        // Keep the invalid component visible so migration never enables an invalid path.
        try { cleanFolder(data.plannerFolder); result[key] = value; }
        catch { result[key] = data.plannerFolder; }
      }
    } else if (typeof data[key] === 'string') result[key] = data[key];
  }
  if (typeof data.dayWidth === 'number' && [140, 190, 250].includes(data.dayWidth)) result.dayWidth = data.dayWidth;
  if (data.propertyNames && typeof data.propertyNames === 'object' && !Array.isArray(data.propertyNames)) {
    const names = data.propertyNames as Record<string, unknown>;
    for (const key of ENTRY_PROPERTIES) if (typeof names[key] === 'string') result.propertyNames[key] = names[key];
  }
  return result;
}

export function cleanFolder(folder: string): string {
  const input = folder.trim().replace(/\\/g, '/').normalize();
  if (input.startsWith('/') || /^[a-z]:/i.test(input) || input.split('/').some(part => part === '..' || part === '.')) throw new Error('Use a folder path inside the vault, without . or .. segments.');
  return input.replace(/\/+/g, '/').replace(/\/$/, '');
}

export function validateSettings(candidate: PlannerSettings): PlannerSettings {
  const result = cloneSettings(candidate);
  result.entryFolder = cleanFolder(result.entryFolder);
  result.threadFolder = cleanFolder(result.threadFolder);
  if (![140, 190, 250].includes(result.dayWidth)) throw new Error('Choose a valid day width.');
  const used = new Set<string>();
  for (const key of ENTRY_PROPERTIES) {
    const name = result.propertyNames[key].trim();
    const folded = name.toLocaleLowerCase();
    if (!name || /[\r\n]/.test(name) || name.includes('\u0000')) throw new Error('Enter a valid ' + key + ' property name.');
    if (['planner_type', '__proto__', 'constructor', 'prototype'].includes(folded)) throw new Error('The property name "' + name + '" is reserved.');
    if (used.has(folded)) throw new Error('Use four different property names for date, title, thread and connections.');
    used.add(folded); result.propertyNames[key] = name;
  }
  return result;
}

export function creationFolder(settings: PlannerSettings, kind: 'entry' | 'thread'): string {
  return cleanFolder(kind === 'entry' ? settings.entryFolder : settings.threadFolder);
}

export function readEntryProperties(frontmatter: Record<string, unknown>, names: PropertyNames): Record<EntryProperty, unknown> {
  return { date: frontmatter[names.date], title: frontmatter[names.title], thread: frontmatter[names.thread], next: frontmatter[names.next] };
}

export function mapEntryFields(fields: Record<string, unknown>, names: PropertyNames): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const target = ENTRY_PROPERTIES.includes(key as EntryProperty) ? names[key as EntryProperty] : key;
    if (['__proto__', 'constructor', 'prototype'].includes(target.toLocaleLowerCase())) throw new Error(`The property name "${target}" is reserved.`);
    if (Object.prototype.hasOwnProperty.call(result, target)) throw new Error(`Two values would write the same property: ${target}.`);
    Object.defineProperty(result, target, { value, enumerable: true, writable: true, configurable: true });
  }
  return result;
}

export function changesIndex(before: PlannerSettings, after: PlannerSettings): boolean {
  return ENTRY_PROPERTIES.some(key => before.propertyNames[key] !== after.propertyNames[key]);
}
