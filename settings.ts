export interface PropertyNames { date: string; title: string; thread: string; next: string }
export type EntryProperty = keyof PropertyNames;
export interface PlannerSettings {
  entryFolder: string;
  threadFolder: string;
  dayWidth: number;
  searchEntireVault: boolean;
  searchFolder: string;
  propertyNames: PropertyNames;
}

export const DEFAULT_PROPERTIES: Readonly<PropertyNames> = { date: 'date', title: 'title', thread: 'thread', next: 'next' };
export const ENTRY_PROPERTIES: EntryProperty[] = ['date', 'title', 'thread', 'next'];

export function defaultSettings(): PlannerSettings {
  return { entryFolder: 'Planner/Entries', threadFolder: 'Planner/Threads', dayWidth: 190, searchEntireVault: true, searchFolder: '', propertyNames: { ...DEFAULT_PROPERTIES } };
}

export function cloneSettings(settings: PlannerSettings): PlannerSettings { return { ...settings, propertyNames: { ...settings.propertyNames } }; }

export function loadSettings(saved: unknown): PlannerSettings {
  const result = defaultSettings();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return result;
  const data = saved as Record<string, unknown>;
  for (const key of ['entryFolder', 'threadFolder', 'searchFolder'] as const) if (typeof data[key] === 'string') result[key] = data[key];
  if (typeof data.searchEntireVault === 'boolean') result.searchEntireVault = data.searchEntireVault;
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
  try { result.searchFolder = cleanFolder(result.searchFolder); }
  catch (error) { if (!result.searchEntireVault) throw error; result.searchFolder = ''; }
  if (!result.searchEntireVault && !result.searchFolder) throw new Error('Choose a Search folder, or enable Search entire vault.');
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
  if (settings.searchEntireVault) return true;
  let folder: string;
  try { folder = cleanFolder(settings.searchFolder); } catch { return false; }
  return Boolean(folder) && path.startsWith(`${folder}/`);
}

export function folderIntersectsScope(folder: string, settings: PlannerSettings): boolean {
  if (settings.searchEntireVault) return true;
  let selected: string;
  try { selected = cleanFolder(settings.searchFolder); } catch { return false; }
  return Boolean(selected) && (folder === selected || folder.startsWith(`${selected}/`) || selected.startsWith(`${folder}/`));
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
  return before.searchEntireVault !== after.searchEntireVault || before.searchFolder !== after.searchFolder || ENTRY_PROPERTIES.some(key => before.propertyNames[key] !== after.propertyNames[key]);
}
