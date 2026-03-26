'use client';

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getRodjerHelp, type PickedFile } from '@/lib/rodjerhelp';
import { ArrowUp, WarningCircle, Paperclip, X } from '@phosphor-icons/react';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import { useSpeechInput } from '@/hooks/useSpeechInput';
import { useTypingPlaceholder } from '@/hooks/useTypingPlaceholder';
import { SpeechInputButton } from '@/components/ui/SpeechInputButton';
import { ModelIndicator } from '@/components/ui/ModelIndicator';
import { FileAccessModeSelect } from '@/components/ui/FileAccessModeSelect';
import { TaskModeSelect } from '@/components/ui/TaskModeSelect';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';

function reviveInputInteractivity() {
  document.body.style.pointerEvents = '';
  document.documentElement.style.pointerEvents = '';
  document.body.removeAttribute('inert');
  document.documentElement.removeAttribute('inert');
  document.body.removeAttribute('aria-hidden');
  document.documentElement.removeAttribute('aria-hidden');
}

function focusTextareaSafely(textarea: HTMLTextAreaElement | null, delay = 0) {
  window.setTimeout(() => {
    reviveInputInteractivity();
    if (!textarea || textarea.disabled) return;
    textarea.focus();
    const valueLength = textarea.value?.length ?? 0;
    try {
      textarea.setSelectionRange(valueLength, valueLength);
    } catch {
      // ignore selection errors
    }
  }, delay);
}

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  typingPlaceholder?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  onOpenSpeechSettings?: () => void;
  onOpenModelSettings?: () => void;
  hideModelWhenNoModel?: boolean;
  autoSubmitOnTranscription?: boolean;
  toolbarLeft?: ReactNode;
  attachments?: PickedFile[];
  onAddAttachments?: (files: PickedFile[]) => void;
  onRemoveAttachment?: (path: string) => void;
}

export function TaskInputBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Поставьте задачу или задайте вопрос',
  typingPlaceholder = false,
  isLoading = false,
  disabled = false,
  large: _large = false,
  autoFocus = false,
  onOpenSpeechSettings,
  onOpenModelSettings,
  hideModelWhenNoModel = false,
  autoSubmitOnTranscription = true,
  toolbarLeft,
  attachments = [],
  onAddAttachments,
  onRemoveAttachment,
}: TaskInputBarProps) {
  const { t } = useTranslation('common');
  const isInputDisabled = disabled || isLoading;
  const isOverLimit = value.length > PROMPT_DEFAULT_MAX_LENGTH;
  const canSubmit = !!value.trim() && !disabled && !isOverLimit;
  const isSubmitDisabled = !isLoading && (!canSubmit || isInputDisabled);
  const submitLabel = isLoading ? t('buttons.stop') : t('buttons.submit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const animatedPlaceholder = useTypingPlaceholder({
    enabled: typingPlaceholder && !value,
    text: placeholder,
  });
  const effectivePlaceholder = typingPlaceholder && !value ? animatedPlaceholder : placeholder;
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const accomplish = getRodjerHelp();

  const normalizeDroppedFiles = useCallback(
    async (fileList: FileList | null): Promise<PickedFile[]> => {
      if (!fileList) return [];

      const dropped = Array.from(fileList);
      if (window.accomplish?.resolveDroppedChatFiles) {
        const resolved = await window.accomplish.resolveDroppedChatFiles(dropped);
        if (resolved.length > 0) return resolved;
      }

      const seen = new Set<string>();
      const files: PickedFile[] = [];

      for (const file of dropped) {
        const filePath = String((file as File & { path?: string }).path || '').trim();
        if (!filePath || seen.has(filePath)) continue;
        seen.add(filePath);
        files.push({
          path: filePath,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
        });
      }

      return files;
    },
    [],
  );

  const handleDroppedFiles = useCallback(
    async (fileList: FileList | null) => {
      const droppedFiles = await normalizeDroppedFiles(fileList);
      if (!droppedFiles.length) return;
      onAddAttachments?.(droppedFiles);
      focusTextareaSafely(textareaRef.current, 0);
    },
    [normalizeDroppedFiles, onAddAttachments],
  );

  const speechInput = useSpeechInput({
    onTranscriptionComplete: (text) => {
      const newValue = value.trim() ? `${value} ${text}` : text;
      onChange(newValue);

      if (autoSubmitOnTranscription && newValue.trim()) {
        pendingAutoSubmitRef.current = newValue;
      }

      setTimeout(() => {
        reviveInputInteractivity();
        textareaRef.current?.focus();
      }, 0);
    },
    onError: (error) => {
      console.error('[Речь] Ошибка:', error.message);
    },
  });

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      reviveInputInteractivity();
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const restore = () => focusTextareaSafely(textareaRef.current, 0);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        focusTextareaSafely(textareaRef.current, 30);
      }
    };

    window.addEventListener('focus', restore);
    window.addEventListener('pageshow', restore);
    window.addEventListener('mouseup', restore);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', restore);
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('mouseup', restore);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!autoSubmitOnTranscription || isInputDisabled || isOverLimit) {
      return;
    }
    if (pendingAutoSubmitRef.current && value === pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = null;
      onSubmit();
    }
  }, [autoSubmitOnTranscription, isInputDisabled, isOverLimit, onSubmit, value]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit && !speechInput.isRecording && !isLoading) {
        onSubmit();
      }
    }
  };

  return (
    <div className="w-full space-y-2">
      {speechInput.error && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
        >
          <WarningCircle className="h-4 w-4" />
          <AlertDescription className="text-xs leading-tight">
            {speechInput.error.message}
            {speechInput.error.code === 'EMPTY_RESULT' && (
              <button
                onClick={() => speechInput.retry()}
                className="ml-2 underline hover:no-underline"
                type="button"
              >
                {t('buttons.retry')}
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div
        className={`rounded-[12px] border bg-popover/70 transition-all duration-200 ease-accomplish cursor-text focus-within:border-muted-foreground/40 ${isDragOver ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
        onPointerDownCapture={() => focusTextareaSafely(textareaRef.current, 0)}
        onMouseDown={() => reviveInputInteractivity()}
        onClick={() => {
          focusTextareaSafely(textareaRef.current, 0);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepthRef.current += 1;
          setIsDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          if (!isDragOver) setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepthRef.current = 0;
          setIsDragOver(false);
          void handleDroppedFiles(e.dataTransfer.files);
        }}
      >
        <div className="px-4 pt-3 pb-1">
          <textarea
            data-testid="task-input-textarea"
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => reviveInputInteractivity()}
            onMouseDown={() => reviveInputInteractivity()}
            placeholder={effectivePlaceholder}
            disabled={isInputDisabled || speechInput.isRecording}
            rows={3}
            className="w-full min-h-[60px] max-h-[200px] resize-none overflow-y-auto bg-transparent text-[16px] leading-relaxed tracking-[-0.015em] text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />

          {attachments.length > 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {attachments.map((f) => (
                <div
                  key={f.path}
                  className="group inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-muted/55 px-3 py-1.5 text-xs text-foreground shadow-sm transition-colors hover:bg-muted/75"
                  title={f.path}
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="max-w-[220px] truncate font-medium">{f.name}</span>
                  <span className="shrink-0 text-muted-foreground/80">
                    {f.size ? `${Math.max(1, Math.round(f.size / 1024))} КБ` : ''}
                  </span>
                  {onRemoveAttachment && (
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveAttachment(f.path);
                      }}
                      aria-label="Удалить вложение"
                      title="Удалить"
                    >
                      <X className="h-3 w-3" weight="bold" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {isDragOver && (
          <div className="px-4 pb-2 text-xs text-primary">
            Отпустите файл, чтобы прикрепить его к сообщению
          </div>
        )}

        <div className="flex h-[36px] items-center justify-between pl-3 pr-2 mb-2">
          <div className="flex items-center gap-2">
            {toolbarLeft}
            <TaskModeSelect />
            <FileAccessModeSelect />
          </div>

          <div className="flex items-center gap-3">
            {onOpenModelSettings && (
              <ModelIndicator
                isRunning={false}
                onOpenSettings={onOpenModelSettings}
                hideWhenNoModel={hideModelWhenNoModel}
              />
            )}

            <SpeechInputButton
              isRecording={speechInput.isRecording}
              isTranscribing={speechInput.isTranscribing}
              recordingDuration={speechInput.recordingDuration}
              error={speechInput.error}
              isConfigured={speechInput.isConfigured}
              disabled={isInputDisabled}
              onStartRecording={() => speechInput.startRecording()}
              onStopRecording={() => speechInput.stopRecording()}
              onCancel={() => speechInput.cancelRecording()}
              onRetry={() => speechInput.retry()}
              onOpenSettings={onOpenSpeechSettings}
              size="md"
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="task-input-submit"
                  type="button"
                  aria-label={submitLabel}
                  title={submitLabel}
                  onClick={() => {
                    accomplish.logEvent({
                      level: 'info',
                      message: 'Нажата отправка ввода задачи',
                      context: { prompt: value },
                    });
                    onSubmit();
                  }}
                  disabled={isSubmitDisabled || speechInput.isRecording}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-accomplish ${
                    isLoading
                      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      : isSubmitDisabled || speechInput.isRecording
                        ? 'bg-muted text-muted-foreground/60'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {isLoading ? (
                    <span className="block h-[10px] w-[10px] rounded-[1.5px] bg-destructive-foreground" />
                  ) : (
                    <ArrowUp className="h-4 w-4" weight="bold" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <span>
                  {isOverLimit
                    ? t('buttons.messageTooLong')
                    : !value.trim()
                      ? t('buttons.enterMessage')
                      : submitLabel}
                </span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
