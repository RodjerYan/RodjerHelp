import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderLock, CaretDown } from '@phosphor-icons/react';
import type { FileAccessMode } from '@accomplish_ai/agent-core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const FILE_ACCESS_MODE_FALLBACK: FileAccessMode = 'limited';

export function FileAccessModeSelect({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const [mode, setMode] = useState<FileAccessMode>(FILE_ACCESS_MODE_FALLBACK);
  const [isAvailable, setIsAvailable] = useState(() =>
    Boolean(window.accomplish?.getFileAccessMode),
  );

  useEffect(() => {
    let isMounted = true;
    const api = window.accomplish;

    if (!api?.getFileAccessMode) {
      return;
    }

    const syncMode = async () => {
      try {
        const nextMode = await api.getFileAccessMode?.();
        if (!isMounted || !nextMode) {
          return;
        }
        setMode(nextMode);
        setIsAvailable(true);
      } catch {
        if (isMounted) {
          setIsAvailable(false);
        }
      }
    };

    void syncMode();

    const unsubscribe = api.onFileAccessModeChange?.(({ mode: nextMode }) => {
      if (!isMounted) {
        return;
      }
      setMode(nextMode);
      setIsAvailable(true);
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  const label = useMemo(() => {
    return mode === 'full' ? t('fileAccess.full') : t('fileAccess.limited');
  }, [mode, t]);

  const description = useMemo(() => {
    return mode === 'full' ? t('fileAccess.fullDescription') : t('fileAccess.limitedDescription');
  }, [mode, t]);

  const handleModeChange = async (nextValue: string) => {
    const nextMode = nextValue === 'full' ? 'full' : FILE_ACCESS_MODE_FALLBACK;

    setMode(nextMode);

    try {
      await window.accomplish?.setFileAccessMode?.(nextMode);
    } catch {
      const restoredMode = await window.accomplish?.getFileAccessMode?.();
      setMode(restoredMode ?? FILE_ACCESS_MODE_FALLBACK);
    }
  };

  if (!isAvailable) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted',
            mode === 'full' ? 'text-amber-600' : 'text-muted-foreground',
            className,
          )}
          title={description}
          data-testid="file-access-mode-trigger"
        >
          <FolderLock className="h-3.5 w-3.5" weight="bold" />
          <span>{label}</span>
          <CaretDown className="h-3 w-3 opacity-80" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t('fileAccess.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={mode} onValueChange={handleModeChange}>
          <DropdownMenuRadioItem value="limited">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{t('fileAccess.limited')}</span>
              <span className="text-xs text-muted-foreground">
                {t('fileAccess.limitedDescription')}
              </span>
            </div>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="full">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{t('fileAccess.full')}</span>
              <span className="text-xs text-muted-foreground">
                {t('fileAccess.fullDescription')}
              </span>
            </div>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default FileAccessModeSelect;
