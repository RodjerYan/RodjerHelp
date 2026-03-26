'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Task } from '@accomplish_ai/agent-core/common';
import { useTaskStore } from '@/stores/taskStore';
import { getRodjerHelp } from '@/lib/rodjerhelp';
import { staggerContainer } from '@/lib/animations';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ConversationListItem from './ConversationListItem';
import SettingsDialog from './SettingsDialog';
import { Archive, ArrowsDownUp, ChatText, Gear, MagnifyingGlass } from '@phosphor-icons/react';
import {
  type SidebarSortMode,
  type SidebarStatusFilter,
  readArchivedTaskIds,
  readPinnedTaskIds,
  readSidebarShowArchived,
  readSidebarSortMode,
  readSidebarStatusFilter,
  writeArchivedTaskIds,
  writePinnedTaskIds,
  writeSidebarShowArchived,
  writeSidebarSortMode,
  writeSidebarStatusFilter,
} from '@/lib/sidebarPreferences';
import logoImage from '/assets/rodjerhelp-icon.png';

const STATUS_FILTER_ORDER: SidebarStatusFilter[] = ['all', 'active', 'completed', 'failed'];
const SORT_MODES: SidebarSortMode[] = ['recent', 'oldest', 'title'];

function getTaskTimestamp(task: Task): number {
  const timestampCandidate = task.completedAt || task.createdAt;
  if (!timestampCandidate) {
    return 0;
  }
  const parsed = Date.parse(timestampCandidate);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTaskInFilter(task: Task, filter: SidebarStatusFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'active') {
    return (
      task.status === 'running' || task.status === 'queued' || task.status === 'waiting_permission'
    );
  }
  if (filter === 'completed') {
    return task.status === 'completed';
  }
  return task.status === 'failed' || task.status === 'cancelled' || task.status === 'interrupted';
}

export default function Sidebar() {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SidebarStatusFilter>(() =>
    readSidebarStatusFilter(),
  );
  const [sortMode, setSortMode] = useState<SidebarSortMode>(() => readSidebarSortMode());
  const [showArchived, setShowArchived] = useState<boolean>(() => readSidebarShowArchived());
  const [pinnedTaskIds, setPinnedTaskIds] = useState<string[]>(() => readPinnedTaskIds());
  const [archivedTaskIds, setArchivedTaskIds] = useState<string[]>(() => readArchivedTaskIds());

  const {
    tasks,
    loadTasks,
    updateTaskStatus,
    addTaskUpdate,
    openLauncher,
    openLauncherWithPrompt,
  } = useTaskStore();
  const accomplish = getRodjerHelp();
  const { t } = useTranslation('sidebar');

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const unsubscribeStatusChange = accomplish.onTaskStatusChange?.((data) => {
      updateTaskStatus(data.taskId, data.status);
    });

    const unsubscribeTaskUpdate = accomplish.onTaskUpdate((event) => {
      addTaskUpdate(event);
    });

    return () => {
      unsubscribeStatusChange?.();
      unsubscribeTaskUpdate();
    };
  }, [updateTaskStatus, addTaskUpdate, accomplish]);

  useEffect(() => {
    writePinnedTaskIds(pinnedTaskIds);
  }, [pinnedTaskIds]);

  useEffect(() => {
    writeArchivedTaskIds(archivedTaskIds);
  }, [archivedTaskIds]);

  useEffect(() => {
    writeSidebarStatusFilter(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    writeSidebarSortMode(sortMode);
  }, [sortMode]);

  useEffect(() => {
    writeSidebarShowArchived(showArchived);
  }, [showArchived]);

  const pinnedTaskSet = useMemo(() => new Set(pinnedTaskIds), [pinnedTaskIds]);
  const archivedTaskSet = useMemo(() => new Set(archivedTaskIds), [archivedTaskIds]);
  const searchTerm = searchQuery.trim().toLowerCase();
  const archivedCount = useMemo(
    () => tasks.filter((task) => archivedTaskSet.has(task.id)).length,
    [tasks, archivedTaskSet],
  );

  const displayedTasks = useMemo(() => {
    const baseTasks = tasks
      .filter((task) => {
        if (showArchived) {
          return archivedTaskSet.has(task.id);
        }
        return !archivedTaskSet.has(task.id);
      })
      .filter((task) => isTaskInFilter(task, statusFilter))
      .filter((task) => {
        if (!searchTerm) {
          return true;
        }
        const title = (task.summary || task.prompt || '').toLowerCase();
        return title.includes(searchTerm) || task.id.toLowerCase().includes(searchTerm);
      });

    const originalOrder = new Map(tasks.map((task, index) => [task.id, index]));
    const pinnedOrder = new Map(pinnedTaskIds.map((taskId, index) => [taskId, index]));

    return [...baseTasks].sort((left, right) => {
      const leftPinned = pinnedTaskSet.has(left.id);
      const rightPinned = pinnedTaskSet.has(right.id);
      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }
      if (leftPinned && rightPinned) {
        const leftPinOrder = pinnedOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightPinOrder = pinnedOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftPinOrder !== rightPinOrder) {
          return leftPinOrder - rightPinOrder;
        }
      }

      if (sortMode === 'title') {
        const leftTitle = (left.summary || left.prompt || '').trim();
        const rightTitle = (right.summary || right.prompt || '').trim();
        const byTitle = leftTitle.localeCompare(rightTitle, 'ru', { sensitivity: 'base' });
        if (byTitle !== 0) {
          return byTitle;
        }
      } else {
        const leftTimestamp = getTaskTimestamp(left);
        const rightTimestamp = getTaskTimestamp(right);
        if (leftTimestamp !== rightTimestamp) {
          return sortMode === 'recent'
            ? rightTimestamp - leftTimestamp
            : leftTimestamp - rightTimestamp;
        }
      }

      return (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0);
    });
  }, [
    tasks,
    showArchived,
    archivedTaskSet,
    statusFilter,
    searchTerm,
    sortMode,
    pinnedTaskSet,
    pinnedTaskIds,
  ]);

  const handleNewConversation = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const togglePinTask = useCallback((taskId: string) => {
    setPinnedTaskIds((prev) => {
      if (prev.includes(taskId)) {
        return prev.filter((id) => id !== taskId);
      }
      return [taskId, ...prev];
    });
  }, []);

  const toggleArchiveTask = useCallback((taskId: string) => {
    setArchivedTaskIds((prev) => {
      if (prev.includes(taskId)) {
        return prev.filter((id) => id !== taskId);
      }
      return [taskId, ...prev];
    });
  }, []);

  const duplicateTaskPrompt = useCallback(
    (task: Task) => {
      openLauncherWithPrompt(task.prompt);
    },
    [openLauncherWithPrompt],
  );

  const getEmptyStateText = () => {
    if (searchTerm) {
      return t('noTasksFound');
    }
    if (showArchived) {
      return t('noArchivedTasks');
    }
    if (statusFilter !== 'all') {
      return t('noTasksForFilter');
    }
    return t('noConversations');
  };

  return (
    <>
      <div className="flex h-screen w-[280px] flex-col border-r border-white/10 bg-card/80 pt-12 macos26-surface macos26-sidebar shadow-2xl">
        <div className="flex gap-2 border-b border-white/10 px-3 py-3">
          <Button
            data-testid="sidebar-new-task-button"
            onClick={handleNewConversation}
            variant="default"
            size="sm"
            className="flex-1 justify-center gap-2"
            title={t('newTask')}
          >
            <ChatText className="h-4 w-4" />
            {t('newTask')}
          </Button>
          <Button
            onClick={openLauncher}
            variant="outline"
            size="sm"
            className="px-2"
            title={t('searchTasks')}
          >
            <MagnifyingGlass className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b border-white/10 px-3 py-3 space-y-2.5">
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('taskSearchPlaceholder')}
              className="h-8 w-full rounded-md border border-border/70 bg-background/40 pl-8 pr-2 text-xs text-foreground outline-none transition-colors focus:border-muted-foreground/60"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {STATUS_FILTER_ORDER.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`h-7 shrink-0 rounded-md px-2.5 text-[11px] font-medium transition-colors ${
                  statusFilter === filter
                    ? 'bg-primary/20 text-primary'
                    : 'bg-background/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(`filters.${filter}`)}
              </button>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-auto h-7 shrink-0 rounded-md border border-border/70 bg-background/30 px-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  title={t('sortLabel')}
                >
                  <ArrowsDownUp className="h-3.5 w-3.5" />
                  {t(`sort.${sortMode}`)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SORT_MODES.map((mode) => (
                  <DropdownMenuItem key={mode} onClick={() => setSortMode(mode)}>
                    {t(`sort.${mode}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <button
            type="button"
            onClick={() => setShowArchived((prev) => !prev)}
            className="h-7 w-full rounded-md border border-border/70 bg-background/30 px-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived
              ? t('showMainList')
              : t('showArchived', {
                  count: archivedCount,
                })}
          </button>

          {showArchived && archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setArchivedTaskIds([])}
              className="h-7 w-full rounded-md border border-border/70 bg-background/30 px-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('restoreAllArchived')}
            </button>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2.5">
            <AnimatePresence mode="wait">
              {displayedTasks.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  {getEmptyStateText()}
                </motion.div>
              ) : (
                <motion.div
                  key="task-list"
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="space-y-1"
                >
                  {displayedTasks.map((task) => (
                    <ConversationListItem
                      key={task.id}
                      task={task}
                      isPinned={pinnedTaskSet.has(task.id)}
                      isArchived={archivedTaskSet.has(task.id)}
                      onTogglePin={togglePinTask}
                      onToggleArchive={toggleArchiveTask}
                      onDuplicatePrompt={duplicateTaskPrompt}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between border-t border-white/10 px-3 py-4">
          <div className="flex items-center">
            <img src={logoImage} alt="RodjerHelp" style={{ height: '32px', paddingLeft: '6px' }} />
          </div>

          <Button
            data-testid="sidebar-settings-button"
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            title={t('settings')}
          >
            <Gear className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
