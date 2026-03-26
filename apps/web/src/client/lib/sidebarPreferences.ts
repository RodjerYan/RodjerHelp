export type SidebarStatusFilter = 'all' | 'active' | 'completed' | 'failed';
export type SidebarSortMode = 'recent' | 'oldest' | 'title';

const PINNED_TASKS_KEY = 'rodjerhelp.sidebar.pinnedTaskIds';
const ARCHIVED_TASKS_KEY = 'rodjerhelp.sidebar.archivedTaskIds';
const STATUS_FILTER_KEY = 'rodjerhelp.sidebar.statusFilter';
const SORT_MODE_KEY = 'rodjerhelp.sidebar.sortMode';
const SHOW_ARCHIVED_KEY = 'rodjerhelp.sidebar.showArchived';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJsonArray(key: string): string[] {
  if (!canUseStorage()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function writeJsonArray(key: string, values: string[]): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // ignore storage write errors
  }
}

function readValue<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  if (!canUseStorage()) {
    return fallback;
  }
  try {
    const value = window.localStorage.getItem(key);
    if (value && allowed.includes(value as T)) {
      return value as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function writeValue(key: string, value: string): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage write errors
  }
}

export function readPinnedTaskIds(): string[] {
  return readJsonArray(PINNED_TASKS_KEY);
}

export function writePinnedTaskIds(taskIds: string[]): void {
  writeJsonArray(PINNED_TASKS_KEY, taskIds);
}

export function readArchivedTaskIds(): string[] {
  return readJsonArray(ARCHIVED_TASKS_KEY);
}

export function writeArchivedTaskIds(taskIds: string[]): void {
  writeJsonArray(ARCHIVED_TASKS_KEY, taskIds);
}

export function readSidebarStatusFilter(): SidebarStatusFilter {
  return readValue<SidebarStatusFilter>(STATUS_FILTER_KEY, 'all', [
    'all',
    'active',
    'completed',
    'failed',
  ]);
}

export function writeSidebarStatusFilter(filter: SidebarStatusFilter): void {
  writeValue(STATUS_FILTER_KEY, filter);
}

export function readSidebarSortMode(): SidebarSortMode {
  return readValue<SidebarSortMode>(SORT_MODE_KEY, 'recent', ['recent', 'oldest', 'title']);
}

export function writeSidebarSortMode(mode: SidebarSortMode): void {
  writeValue(SORT_MODE_KEY, mode);
}

export function readSidebarShowArchived(): boolean {
  if (!canUseStorage()) {
    return false;
  }
  try {
    return window.localStorage.getItem(SHOW_ARCHIVED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarShowArchived(showArchived: boolean): void {
  writeValue(SHOW_ARCHIVED_KEY, showArchived ? '1' : '0');
}
