import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, CaretDown } from '@phosphor-icons/react';
import type { TaskPersonaMode } from '@accomplish_ai/agent-core/common';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTaskStore } from '@/stores/taskStore';
import { cn } from '@/lib/utils';

const TASK_MODES: TaskPersonaMode[] = ['default', 'code-review', 'analysis', 'sales', 'executive'];

export function TaskModeSelect({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const taskMode = useTaskStore((state) => state.taskMode);
  const setTaskMode = useTaskStore((state) => state.setTaskMode);

  const label = useMemo(() => t(`taskMode.options.${taskMode}.label`), [taskMode, t]);
  const description = useMemo(() => t(`taskMode.options.${taskMode}.description`), [taskMode, t]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted',
            className,
          )}
          title={description}
          data-testid="task-mode-trigger"
        >
          <Cpu className="h-3.5 w-3.5" weight="bold" />
          <span>{label}</span>
          <CaretDown className="h-3 w-3 opacity-80" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>{t('taskMode.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={taskMode}
          onValueChange={(value: string) => setTaskMode(value as TaskPersonaMode)}
        >
          {TASK_MODES.map((mode) => (
            <DropdownMenuRadioItem key={mode} value={mode}>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{t(`taskMode.options.${mode}.label`)}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`taskMode.options.${mode}.description`)}
                </span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default TaskModeSelect;
