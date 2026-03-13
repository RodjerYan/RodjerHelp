import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { useTaskStore } from '@/stores/taskStore';
import { getRodjerHelp } from '@/lib/rodjerhelp';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/animations';
import { TaskLauncherItem } from './TaskLauncherItem';
import { hasAnyReadyProvider } from '@accomplish_ai/agent-core/common';
import { Input } from '@/components/ui/input';

export function TaskLauncher() {
  const navigate = useNavigate();
  const { t } = useTranslation('sidebar');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { isLauncherOpen, launcherInitialPrompt, closeLauncher, tasks, startTask } = useTaskStore();
  const accomplish = getRodjerHelp();
  const [openedAt, setOpenedAt] = useState(Date.now);

  // Фильтруем задачи по поисковому запросу (только заголовок)
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) {
      // Показываем последние 7 дней, если поиска нет
      const sevenDaysAgo = openedAt - 7 * 24 * 60 * 60 * 1000;
      return tasks.filter((t) => new Date(t.createdAt).getTime() > sevenDaysAgo);
    }
    const query = searchQuery.toLowerCase();
    return tasks.filter((t) => t.prompt.toLowerCase().includes(query));
  }, [tasks, searchQuery, openedAt]);

  // Всего элементов: "Новая задача" + отфильтрованные
  const totalItems = 1 + filteredTasks.length;

  // Ограничиваем выбранный индекс при изменении результатов
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync derived state from prop change
    setSelectedIndex((i) => Math.min(i, Math.max(0, totalItems - 1)));
  }, [totalItems]);

  // Сбрасываем состояние при открытии, используем стартовый промпт если есть
  useEffect(() => {
    if (isLauncherOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset state on open
      setSearchQuery(launcherInitialPrompt || '');
      setSelectedIndex(0);
      setOpenedAt(Date.now());
    }
  }, [isLauncherOpen, launcherInitialPrompt]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isLauncherOpen) {
        closeLauncher();
        setSearchQuery('');
        setSelectedIndex(0);
      }
    },
    [isLauncherOpen, closeLauncher],
  );

  const handleSelect = useCallback(
    async (index: number) => {
      if (index === 0) {
        // Выбрана "Новая задача"
        if (searchQuery.trim()) {
          // Проверяем, есть ли готовый провайдер перед стартом задачи
          const settings = await accomplish.getProviderSettings();
          if (!hasAnyReadyProvider(settings)) {
            // Нет готового провайдера — переходим на главную, где откроются настройки
            closeLauncher();
            navigate('/');
            return;
          }
          closeLauncher();
          const taskId = `task_${Date.now()}`;
          const task = await startTask({ prompt: searchQuery.trim(), taskId });
          if (task) {
            navigate(`/execution/${task.id}`);
          }
        } else {
          // Переходим на главную при пустом вводе
          closeLauncher();
          navigate('/');
        }
      } else {
        // Выбрана задача — переходим к ней
        const task = filteredTasks[index - 1];
        if (task) {
          closeLauncher();
          navigate(`/execution/${task.id}`);
        }
      }
    },
    [searchQuery, filteredTasks, closeLauncher, navigate, startTask, accomplish],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Игнорируем Enter во время IME‑ввода (китайский/японский)
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, totalItems - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          handleSelect(selectedIndex);
          break;
        case 'Escape':
          e.preventDefault();
          closeLauncher();
          break;
      }
    },
    [totalItems, selectedIndex, handleSelect, closeLauncher],
  );

  return (
    <DialogPrimitive.Root open={isLauncherOpen} onOpenChange={handleOpenChange}>
      <AnimatePresence>
        {isLauncherOpen && (
          <DialogPrimitive.Portal forceMount>
            {/* Overlay */}
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-white/60 backdrop-blur-[12px]"
              />
            </DialogPrimitive.Overlay>

            {/* Content */}
            <DialogPrimitive.Content
              className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
              aria-describedby={undefined}
              onKeyDown={handleKeyDown}
            >
              <DialogPrimitive.Title className="sr-only">Запуск задач</DialogPrimitive.Title>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={springs.bouncy}
                className="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
              >
                {/* Поле поиска */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <MagnifyingGlass className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('searchPlaceholder')}
                    className="border-0 px-0 py-1 h-full focus:outline-none focus-visible:ring-0"
                  />
                  <DialogPrimitive.Close asChild>
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={t('close')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </DialogPrimitive.Close>
                </div>

                {/* Результаты */}
                <div className="max-h-80 overflow-y-auto p-2">
                  {/* Вариант новой задачи */}
                  <button
                    onClick={() => handleSelect(0)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-md text-sm transition-colors duration-100',
                      'flex items-center gap-2',
                      selectedIndex === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-accent',
                    )}
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>{t('newTask')}</span>
                    {searchQuery.trim() && (
                      <span
                        className={cn(
                          'text-xs truncate',
                          selectedIndex === 0
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground',
                        )}
                      >
                        — &ldquo;{searchQuery}&rdquo;
                      </span>
                    )}
                  </button>

                  {/* Список задач */}
                  {filteredTasks.length > 0 && (
                    <>
                      <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                        {searchQuery.trim() ? t('results') : t('lastSevenDays')}
                      </div>
                      {filteredTasks.slice(0, 10).map((task, i) => (
                        <TaskLauncherItem
                          key={task.id}
                          task={task}
                          isSelected={selectedIndex === i + 1}
                          onClick={() => handleSelect(i + 1)}
                        />
                      ))}
                    </>
                  )}

                  {/* Empty State */}
                  {searchQuery.trim() && filteredTasks.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                      {t('noTasksFound')}
                    </div>
                  )}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4">
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd>{' '}
                    {t('navigate')}
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↵</kbd>{' '}
                    {t('select')}
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd>{' '}
                    {t('close')}
                  </span>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export default TaskLauncher;
