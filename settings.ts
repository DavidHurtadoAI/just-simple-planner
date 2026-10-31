export interface PropertyNames { date: string; title: string; thread: string; next: string }
export type EntryProperty = keyof PropertyNames;
export interface PlannerSettings {
  entryFolder: string;
  threadFolder: string;
  dayWidth: number;
  plannerFolder: string;
  showAllDatedNotes: boolean;
  propertyNames: PropertyNames;
}

export const DEFAULT_PROPERTIES: Readonly<PropertyNames> = { date: 'date', title: 'title', thread: 'thread', next: 'next' };
export const ENTRY_PROPERTIES: EntryProperty[] = ['date', 'title', 'thread', 'next'];

export function defaultSettings(): PlannerSettings {
  return { plannerFolder: 'Planner', entryFolder: 'Entries', threadFolder: 'Threads', dayWidth: 190, showAllDatedNotes: false, propertyNames: { ...DEFAULT_PROPERTIES } };
}

export function cloneSettings(settings: PlannerSettings): PlannerSettings { return { ...settings, propertyNames: { ...settings.propertyNames } }; }

export function loadSettings(saved: unknown): PlannerSettings {
  const result = defaultSettings();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return result;
  const data = saved as Record<string, unknown>;
  if (typeof data.plannerFolder === 'string') {
    result.plannerFolder = data.plannerFolder;
    for (const key of ['entryFolder', 'threadFolder'] as const) if (typeof data[key] === 'string') result[key] = data[key];
  } else if (['entryFolder', 'threadFolder', 'searchEntireVault', 'searchFolder'].some(key => key in data)) {
    // Older creation paths were vault-relative. Keep the old search scope, then express destinations below it.
    const legacyFolder = (path: string): string => { try { return cleanFolder(path); } catch { return path; } };
    result.plannerFolder = data.searchEntireVault === false && typeof data.searchFolder === 'string' ? legacyFolder(data.searchFolder) : '';
    for (const [key, fallback] of [['entryFolder', 'Planner/Entries'], ['threadFolder', 'Planner/Threads']] as const) {
      const path = legacyFolder(typeof data[key] === 'string' ? data[key] : fallback);
      const base = result.plannerFolder;
      result[key] = !base ? path : path === base ? '' : path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path.split('/').pop() ?? '';
    }
  }
  if (typeof data.showAllDatedNotes === 'boolean') result.showAllDatedNotes = data.showAllDatedNotes;
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
  result.plannerFolder = cleanFolder(result.plannerFolder);
  if (![140, 190, 250].includes(result.dayWidth)) throw new Error('Choose a valid day width.');
  const used = new Set<string>();
  for (const key of ENTRY_PROPERTIES) {
    const name = result.propertyNames[key].trim();
    const folded = name.toLocaleLowerCase();
    if (!name || /[\r\n]/.test(name) || name.includes('\u0000')) throw new Error(`Enter a valid ${key} property name.`);
    if (['planner_type', '__proto__', 'constructor', 'prototype'].includes(folded)) throw new Error(`The property name "${name}" is reserved.`);
    if (used.has(folded)) throw new Error('Use four different property names for date, title, thread and connections.');
    used.add(folded); result.propertyNames[key] = name;
  }
  return result;
}

export function pathInScope(path: string, settings: PlannerSettings): boolean {
  let folder: string;
  try { folder = cleanFolder(settings.plannerFolder); } catch { return false; }
  return !folder || path.startsWith(`${folder}/`);
}

export function folderIntersectsScope(folder: string, settings: PlannerSettings): boolean {
  let selected: string;
  try { selected = cleanFolder(settings.plannerFolder); } catch { return false; }
  return !selected || folder === selected || folder.startsWith(`${selected}/`) || selected.startsWith(`${folder}/`);
}

export function creationFolder(settings: PlannerSettings, kind: 'entry' | 'thread'): string {
  return [cleanFolder(settings.plannerFolder), cleanFolder(kind === 'entry' ? settings.entryFolder : settings.threadFolder)].filter(Boolean).join('/');
}

export function legacyDestinationsChanged(saved: unknown, settings: PlannerSettings): boolean {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || 'plannerFolder' in saved) return false;
  const data = saved as Record<string, unknown>;
  try {
    return (['entry', 'thread'] as const).some(kind => {
      const key = kind === 'entry' ? 'entryFolder' : 'threadFolder';
      const previous = typeof data[key] === 'string' ? data[key] : kind === 'entry' ? 'Planner/Entries' : 'Planner/Threads';
      return cleanFolder(previous) !== creationFolder(settings, kind);
    });
  } catch { return false; }
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
  return before.plannerFolder !== after.plannerFolder || before.showAllDatedNotes !== after.showAllDatedNotes || ENTRY_PROPERTIES.some(key => before.propertyNames[key] !== after.propertyNames[key]);
}
