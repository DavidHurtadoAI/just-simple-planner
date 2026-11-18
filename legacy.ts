import type { App } from 'obsidian';
import { unpack } from './notes';
import { validDay, wikiTarget, isPlannerFrontmatter, type Entry, type Thread } from './model';
import { cloneSettings, readEntryProperties, validateSettings, type PlannerSettings } from './settings';

export interface LegacySnapshot {
  settings: PlannerSettings;
  entries: Map<string, Entry>;
  threads: Map<string, Thread>;
  invalid: Set<string>;
  fingerprint: string;
}

/** One read-only discovery per review/create, never a live classic index. */
export async function readLegacyPlanner(app: App, settings: PlannerSettings): Promise<LegacySnapshot> {
  const snapshot: LegacySnapshot = { settings: validateSettings(cloneSettings(settings)), entries: new Map(), threads: new Map(), invalid: new Set(), fingerprint: '' };
  const sources: [string, string][] = [];
  const resolve = (value: unknown, source: string): string | null => {
    const target = wikiTarget(value);
    return target ? app.metadataCache.getFirstLinkpathDest(target, source)?.path ?? null : null;
  };
  for (const file of app.vault.getMarkdownFiles()) {
    const cached = app.metadataCache.getFileCache(file);
    if (cached && !isPlannerFrontmatter(cached.frontmatter)) continue;
    const path = file.path;
    const text = await app.vault.read(file);
    if (file.path !== path || app.vault.getAbstractFileByPath(path) !== file) throw new Error('A note moved during migration review. Refresh the review.');
    let document;
    try { document = unpack(text); }
    catch { if (isPlannerFrontmatter(cached?.frontmatter)) { snapshot.invalid.add(path); sources.push([path, text]); } continue; }
    const { frontmatter: fm, body } = document;
    if (!isPlannerFrontmatter(fm)) continue;
    sources.push([path, text]);
    if (fm.planner_type === 'thread') {
      snapshot.threads.set(path, { path, title: file.basename, status: fm.status === 'parked' || fm.status === 'closed' ? fm.status : 'active', color: typeof fm.color === 'string' ? fm.color : 'blue', order: typeof fm.order === 'number' ? fm.order : 0 });
    } else {
      const props = readEntryProperties(fm, snapshot.settings.propertyNames);
      if (!validDay(props.date)) { snapshot.invalid.add(path); continue; }
      const thread = resolve(props.thread, path) ?? (typeof props.thread === 'string' && props.thread.trim() && !wikiTarget(props.thread) ? 'text:' + props.thread : 'unassigned');
      const next = Array.isArray(props.next) ? props.next.map(value => resolve(value, path)).filter((target): target is string => target !== null && target !== path) : [];
      snapshot.entries.set(path, { path, title: typeof props.title === 'string' && props.title.trim() ? props.title : file.basename, date: props.date, thread, next: [...new Set(next)], body, snapshot: text });
    }
  }
  snapshot.fingerprint = JSON.stringify([snapshot.settings, sources.sort(([a], [b]) => a.localeCompare(b))]);
  return snapshot;
}
