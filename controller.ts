import type { Entry, Thread, History } from './model';
import type { PlannerSettings } from './settings';
import type { Menu, TFile } from 'obsidian';

export interface MembershipDraft {
  file: TFile;
  path: string;
  text: string;
  frontmatter: Record<string, unknown>;
  body: string;
  generation: number;
  title: string;
  originalThread: string;
  thread: string;
  date: string;
}

export interface Patch {
  path: string;
  fields?: Record<string, unknown>;
  body?: string;
  expectedText?: string;
  expectedBody?: string;
  expectedDate?: string;
}

/** A planner surface is owned by one Bases query and editing session. */
export interface PlannerController {
  settings: PlannerSettings;
  entries: Map<string, Entry>;
  threads: Map<string, Thread>;
  invalid: Set<string>;
  readonly history: History;
  configurationIssue(): string | null;
  rows(): Thread[];
  newEntry(date: string, thread?: string, previous?: string): void;
  editEntry(entry: Entry): void;
  file(path: string): TFile;
  link(path: string): string;
  threadValue(thread: string): string;
  patch(patches: Patch[]): Promise<void>;
  connect(source: string, target: string, remove?: boolean): Promise<void>;
  createEntry(title: string, date: string, thread: string, body: string, previous?: string): Promise<void>;
  createThread(title: string, color: string, status: string): Promise<void>;
  toggleEntryTask(entry: Entry, line: number, checked: boolean): Promise<void>;
  perform(action: () => Promise<unknown>): Promise<void>;
  refresh(): void;
  scheduleRefresh(): void;
  reviewNote(file: TFile, options?: { thread?: string; date?: string; remove?: boolean }): Promise<void>;
  saveMembership(draft: MembershipDraft, date: string, thread: string, remove: boolean): Promise<void>;
  droppedNote(data: DataTransfer): TFile | null;
  readonly scopeMessage?: string;
  readonly editGeneration?: number;
  readonly queryOrder?: boolean;
  readonly schedulingEnabled?: boolean;
  readonly scheduleNotice?: string;
  manageThreads?(): void;
  flowPaths?(start: Iterable<string>): Set<string>;
  outsideLinks?(entry: Entry): number;
  projectEntries?(entries: Entry[], first: string, last: string, notebook?: boolean): Entry[];
  canMove?(entry: Entry): boolean;
  scheduleMenu?(menu: Menu, entry: Entry): void;
};
