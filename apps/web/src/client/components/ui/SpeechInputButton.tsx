/**
 * Кнопка голосового ввода
 *
 * Кнопка микрофона, которая переключает запись и показывает статус распознавания.
 * Поддерживает два режима:
 * 1. Клик‑переключатель: нажмите для старта, нажмите снова для остановки и распознавания
 * 2. Нажми‑и‑говори: удерживайте Alt (настраиваемо) для записи, отпустите для распознавания
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Microphone, SpinnerGap, WarningCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SpeechInputButtonProps {
  /**
   * Запись активна
   */
  isRecording: boolean;

  /**
   * Идёт распознавание
   */
  isTranscribing: boolean;

  /**
   * Текущая длительность записи в миллисекундах
   */
  recordingDuration?: number;

  /**
   * Состояние ошибки
   */
  error?: Error | null;

  /**
   * Голосовой ввод настроен
   */
  isConfigured?: boolean;

  /**
   * Отключено (например, во время выполнения задачи)
   */
  disabled?: boolean;

  /**
   * Вызывается при клике для начала записи
   */
  onStartRecording?: () => void;

  /**
   * Вызывается при клике для остановки записи
   */
  onStopRecording?: () => void;

  /**
   * Вызывается при клике для отмены записи
   */
  onCancel?: () => void;

  /**
   * Вызывается при клике для повтора
   */
  onRetry?: () => void;

  /**
   * Вызывается при клике, когда ввод не настроен
   * (чтобы открыть настройки)
   */
  onOpenSettings?: () => void;

  /**
   * Вариант размера
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Пользовательские CSS‑классы
   */
  className?: string;

  /**
   * Пользовательский текст тултипа
   */
  tooltipText?: string;
}

export function SpeechInputButton({
  isRecording,
  isTranscribing,
  recordingDuration = 0,
  error,
  isConfigured = true,
  disabled = false,
  onStartRecording,
  onStopRecording,
  onRetry,
  onOpenSettings,
  size = 'md',
  className,
  tooltipText,
}: SpeechInputButtonProps) {
  const { t } = useTranslation('settings');
  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return 'h-7 w-7 text-xs';
      case 'lg':
        return 'h-11 w-11 text-base';
      case 'md':
      default:
        return 'h-9 w-9 text-sm';
    }
  }, [size]);

  const buttonClasses = useMemo(() => {
    if (isRecording) {
      // Состояние записи: красная кнопка с анимацией
      return 'bg-transparent text-red-600 hover:text-red-700';
    }
    if (isTranscribing) {
      // Состояние распознавания: синяя кнопка
      return 'bg-transparent text-blue-600 hover:text-blue-700 cursor-wait';
    }
    if (error) {
      // Состояние ошибки: красно‑оранжевая кнопка
      return 'bg-transparent text-orange-600 hover:text-orange-700';
    }
    if (!isConfigured) {
      // Не настроено: приглушённый стиль, но кликабельно (откроет настройки)
      return 'bg-transparent text-muted-foreground hover:text-foreground';
    }
    // Обычное состояние: основной цвет
    return 'bg-transparent text-foreground hover:text-primary';
  }, [isRecording, isTranscribing, error, isConfigured]);

  const tooltipLabel = useMemo(() => {
    if (tooltipText) return tooltipText;
    if (!isConfigured) return t('speech.tooltipSetup');
    if (isRecording)
      return t('speech.tooltipRecording', { duration: formatDuration(recordingDuration) });
    if (isTranscribing) return t('speech.tooltipTranscribing');
    if (error) return t('speech.tooltipError');
    return t('speech.tooltipDefault');
  }, [tooltipText, isConfigured, isRecording, isTranscribing, error, recordingDuration, t]);

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isConfigured) {
        // Открыть настройки, если ввод не настроен
        onOpenSettings?.();
      } else if (isRecording) {
        onStopRecording?.();
      } else if (error) {
        onRetry?.();
      } else {
        onStartRecording?.();
      }
    },
    [isConfigured, isRecording, error, onStartRecording, onStopRecording, onRetry, onOpenSettings],
  );

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            disabled={disabled || isTranscribing}
            className={cn(
              'inline-flex items-center justify-center rounded-lg transition-all duration-200 ease-accomplish shrink-0',
              'disabled:cursor-not-allowed disabled:opacity-50',
              sizeClasses,
              buttonClasses,
              className,
            )}
            title={tooltipLabel}
            data-testid="speech-input-button"
          >
            {isTranscribing ? (
              <SpinnerGap className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <div className="relative h-4 w-4">
                <Microphone className="h-4 w-4" />
              </div>
            ) : error ? (
              <WarningCircle className="h-4 w-4" />
            ) : (
              <Microphone className="h-4 w-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-sm">
          {tooltipLabel}
        </TooltipContent>
      </Tooltip>

      {/* Таймер записи */}
      {isRecording && (
        <div className="text-xs font-mono text-red-600 dark:text-red-400 shrink-0 min-w-[40px]">
          {formatDuration(recordingDuration)}
        </div>
      )}

      {/* Status indicator */}
      {isTranscribing && (
        <div className="text-xs text-blue-600 dark:text-blue-400 shrink-0">Обработка...</div>
      )}

      {/* Error retry helper text */}
      {error && !isRecording && !isTranscribing && (
        <div className="text-xs text-orange-600 dark:text-orange-400 shrink-0">Повторить</div>
      )}
    </div>
  );
}

/**
 * Format milliseconds to MM:SS display
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Standalone microphone icon button (for use in other places)
 */
export function MicrophoneIcon({
  isRecording,
  className,
}: {
  isRecording?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <Microphone className={cn('h-4 w-4', isRecording && 'text-red-500 animate-pulse')} />
      {isRecording && (
        <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75" />
      )}
    </div>
  );
}
