import type JustSimplePlanner from './main';
import type { Entry } from './model';
import type { Menu } from 'obsidian';

/** The shared planner surface depends on a session, not on a global vault index. */
export type PlannerController = Pick<JustSimplePlanner,
  'settings' | 'entries' | 'threads' | 'invalid' | 'history' | 'configurationIssue' |
  'rows' | 'newEntry' | 'editEntry' | 'file' | 'link' | 'threadValue' | 'patch' |
  'connect' | 'createEntry' | 'createThread' | 'toggleEntryTask' | 'perform' |
  'refresh' | 'scheduleRefresh' | 'reviewNote' | 'saveMembership' | 'droppedNote'
> & {
  readonly basesMode?: boolean;
  readonly scopeMessage?: string;
  readonly editGeneration?: number;
  readonly queryOrder?: boolean;
  readonly schedulingEnabled?: boolean;
  readonly scheduleNotice?: string;
  openMigration?(): void;
  manageThreads?(): void;
  flowPaths?(start: Iterable<string>): Set<string>;
  outsideLinks?(entry: Entry): number;
  onModalClosed?(): void;
  projectEntries?(entries: Entry[], first: string, last: string, notebook?: boolean): Entry[];
  canMove?(entry: Entry): boolean;
  scheduleMenu?(menu: Menu, entry: Entry): void;
};
