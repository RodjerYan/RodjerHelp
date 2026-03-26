import { useMemo, type MouseEvent } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Task } from '@accomplish_ai/agent-core/common';
import { cn } from '@/lib/utils';
import { DotsThree, PushPin, SpinnerGap, X } from '@phosphor-icons/react';
import { useTaskStore } from '@/stores/taskStore';
import { STATUS_COLORS, extractDomains } from '@/lib/task-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ConversationListItemProps {
  task: Task;
  isPinned?: boolean;
  isArchived?: boolean;
  onTogglePin?: (taskId: string) => void;
  onToggleArchive?: (taskId: string) => void;
  onDuplicatePrompt?: (task: Task) => void;
}

export function ConversationListItem({
  task,
  isPinned = false,
  isArchived = false,
  onTogglePin,
  onToggleArchive,
  onDuplicatePrompt,
}: ConversationListItemProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('sidebar');
  const isActive = location.pathname === `/execution/${task.id}`;
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const domains = useMemo(() => extractDomains(task), [task]);

  const handleClick = () => {
    navigate(`/execution/${task.id}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!window.confirm(t('confirmDelete'))) {
      return;
    }

    await deleteTask(task.id);

    if (isActive) {
      navigate('/');
    }
  };

  const statusColor = STATUS_COLORS[task.status] || 'bg-muted-foreground';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      title={task.summary || task.prompt}
      className={cn(
        'w-full text-left p-2 rounded-lg text-xs font-medium transition-colors duration-200',
        'text-foreground hover:bg-accent hover:text-foreground',
        'flex items-center gap-3 group relative cursor-pointer',
        isActive && 'bg-accent text-foreground',
      )}
    >
      <span className="flex items-center justify-center shrink-0 w-3 h-3">
        {task.status === 'running' || task.status === 'waiting_permission' ? (
          <SpinnerGap className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <span className={cn('w-2 h-2 rounded-full', statusColor)} />
        )}
      </span>
      {isPinned && <PushPin className="h-3 w-3 shrink-0 text-primary" weight="fill" />}
      <span className="block truncate flex-1 tracking-[0.18px]">{task.summary || task.prompt}</span>
      <span className="relative flex items-center shrink-0 h-5">
        {domains.length > 0 && (
          <span className="flex items-center group-hover:opacity-0 transition-opacity duration-200">
            {domains.map((domain, i) => (
              <span
                key={domain}
                className={cn(
                  'flex items-center p-0.5 rounded-full bg-card shrink-0 relative',
                  i > 0 && '-ml-1',
                  i === 0 && 'z-30',
                  i === 1 && 'z-20',
                  i === 2 && 'z-10',
                )}
              >
                <img
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                  alt={domain}
                  className="w-3 h-3 rounded-full"
                  loading="lazy"
                />
              </span>
            ))}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
              }}
              className={cn(
                'absolute right-0 top-1/2 -translate-y-1/2',
                'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
                'transition-opacity duration-200',
                'p-1 rounded hover:bg-muted',
                'text-zinc-400 hover:text-foreground',
              )}
              aria-label={t('taskActions')}
              title={t('taskActions')}
            >
              <DotsThree className="h-4 w-4" weight="bold" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-[180px]"
            onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            <DropdownMenuItem
              onClick={(event: MouseEvent<HTMLDivElement>) => {
                event.stopPropagation();
                onTogglePin?.(task.id);
              }}
            >
              {isPinned ? t('unpinTask') : t('pinTask')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(event: MouseEvent<HTMLDivElement>) => {
                event.stopPropagation();
                onToggleArchive?.(task.id);
              }}
            >
              {isArchived ? t('unarchiveTask') : t('archiveTask')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(event: MouseEvent<HTMLDivElement>) => {
                event.stopPropagation();
                onDuplicatePrompt?.(task);
              }}
            >
              {t('repeatTaskPrompt')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <X className="h-3 w-3" />
              {t('deleteTask')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}

export default ConversationListItem;
