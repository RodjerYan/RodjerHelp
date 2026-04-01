import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TaskInputBar } from '@/components/landing/TaskInputBar';
import { SettingsDialog } from '@/components/layout/SettingsDialog';
import { useTaskStore } from '@/stores/taskStore';
import {
  clearLastPickedChatFiles,
  getRodjerHelp,
  setLastPickedChatFiles,
  type PickedFile,
} from '@/lib/rodjerhelp';
import { springs } from '@/lib/animations';
import { ArrowUpLeft } from '@phosphor-icons/react';
import { hasAnyReadyProvider } from '@accomplish_ai/agent-core/common';
import { PlusMenu } from '@/components/landing/PlusMenu';
import { IntegrationIcon } from '@/components/landing/IntegrationIcons';

const USE_CASE_KEYS = [
  { key: 'calendarPrepNotes', icons: ['calendar.google.com', 'docs.google.com'] },
  { key: 'inboxPromoCleanup', icons: ['mail.google.com'] },
  { key: 'competitorPricingDeck', icons: ['slides.google.com', 'sheets.google.com'] },
  { key: 'notionApiAudit', icons: ['notion.so'] },
  { key: 'stagingVsProdVisual', icons: ['google.com'] },
  { key: 'prodBrokenLinks', icons: ['google.com'] },
  { key: 'portfolioMonitoring', icons: ['finance.yahoo.com'] },
  { key: 'jobApplicationAutomation', icons: ['linkedin.com'] },
  { key: 'eventCalendarBuilder', icons: ['eventbrite.com', 'calendar.google.com'] },
] as const;

export function HomePage() {
  const [prompt, setPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<PickedFile[]>([]);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'providers' | 'voice' | 'skills' | 'connectors'
  >('providers');

  const { startTask, interruptTask, isLoading, addTaskUpdate, setPermissionRequest } =
    useTaskStore();

  const navigate = useNavigate();
  const accomplish = useMemo(() => getRodjerHelp(), []);
  const { t } = useTranslation('home');

  const useCaseExamples = useMemo(() => {
    return USE_CASE_KEYS.map(({ key, icons }) => ({
      title: t(`useCases.${key}.title`),
      description: t(`useCases.${key}.description`),
      prompt: t(`useCases.${key}.prompt`),
      icons,
    }));
  }, [t]);

  useEffect(() => {
    const unsubscribeTask = accomplish.onTaskUpdate((event) => {
      addTaskUpdate(event);
    });

    const unsubscribePermission = accomplish.onPermissionRequest((request) => {
      setPermissionRequest(request);
    });

    return () => {
      unsubscribeTask();
      unsubscribePermission();
    };
  }, [addTaskUpdate, setPermissionRequest, accomplish]);

  const handleAttachFiles = useCallback(async () => {
    try {
      const files = await accomplish.pickChatFiles();
      if (!files || files.length === 0) return;

      let nextFiles: PickedFile[] = [];
      setAttachedFiles((prev) => {
        const seen = new Set(prev.map((p) => p.path));
        nextFiles = [...prev];

        for (const f of files) {
          if (!seen.has(f.path)) {
            nextFiles.push(f);
            seen.add(f.path);
          }
        }

        return nextFiles;
      });

      await setLastPickedChatFiles(nextFiles);
    } catch (err) {
      console.error('Не удалось выбрать файлы:', err);
    }
  }, [accomplish]);

  const handleRemoveAttachment = useCallback((path: string) => {
    setAttachedFiles((prev) => {
      const nextFiles = prev.filter((f) => f.path !== path);
      void setLastPickedChatFiles(nextFiles);
      return nextFiles;
    });
  }, []);

  const handleAddAttachments = useCallback((files: PickedFile[]) => {
    setAttachedFiles((prev) => {
      const seen = new Set(prev.map((file) => file.path));
      const nextFiles = [...prev];

      for (const file of files) {
        if (!seen.has(file.path)) {
          nextFiles.push(file);
          seen.add(file.path);
        }
      }

      void setLastPickedChatFiles(nextFiles);
      return nextFiles;
    });
  }, []);

  const executeTask = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    const taskId = `task_${Date.now()}`;
    await setLastPickedChatFiles(attachedFiles);

    const task = await startTask({
      prompt: prompt.trim(),
      taskId,
    });

    if (task) {
      setAttachedFiles([]);
      await clearLastPickedChatFiles();
      setPrompt('');
      navigate(`/execution/${task.id}`);
    }
  }, [attachedFiles, prompt, isLoading, startTask, navigate]);

  const handleSubmit = async () => {
    if (isLoading) {
      void interruptTask();
      return;
    }

    if (!prompt.trim()) return;

    const isE2EMode = await accomplish.isE2EMode();
    if (!isE2EMode) {
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        setSettingsInitialTab('providers');
        setShowSettingsDialog(true);
        return;
      }
    }

    await executeTask();
  };

  const handleSettingsDialogChange = (open: boolean) => {
    setShowSettingsDialog(open);
    if (!open) {
      setSettingsInitialTab('providers');
      focusPromptTextarea(120);
    }
  };

  const handleOpenSpeechSettings = useCallback(() => {
    setSettingsInitialTab('voice');
    setShowSettingsDialog(true);
  }, []);

  const handleOpenModelSettings = useCallback(() => {
    setSettingsInitialTab('providers');
    setShowSettingsDialog(true);
  }, []);

  const handleApiKeySaved = async () => {
    setShowSettingsDialog(false);
    if (prompt.trim()) {
      await executeTask();
      return;
    }
    focusPromptTextarea(120);
  };

  const focusPromptTextarea = useCallback((delay = 0) => {
    window.setTimeout(() => {
      document.body.style.pointerEvents = '';
      document.documentElement.style.pointerEvents = '';
      document.body.removeAttribute('inert');
      document.documentElement.removeAttribute('inert');
      const textarea = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="task-input-textarea"]',
      );
      if (textarea && !textarea.disabled) {
        textarea.focus();
        const valueLength = textarea.value?.length ?? 0;
        try {
          textarea.setSelectionRange(valueLength, valueLength);
        } catch {
          // ignore selection errors for unsupported environments
        }
      }
    }, delay);
  }, []);

  useEffect(() => {
    if (showSettingsDialog) return;

    const restoreFocus = () => focusPromptTextarea(0);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        focusPromptTextarea(30);
      }
    };

    window.addEventListener('focus', restoreFocus);
    window.addEventListener('pageshow', restoreFocus);
    window.addEventListener('mouseup', restoreFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', restoreFocus);
      window.removeEventListener('pageshow', restoreFocus);
      window.removeEventListener('mouseup', restoreFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [focusPromptTextarea, showSettingsDialog]);

  const handleExampleClick = (examplePrompt: string) => {
    setPrompt(examplePrompt);
    focusPromptTextarea();
  };

  const handleSkillSelect = (command: string) => {
    setPrompt((prev) => `${command} ${prev}`.trim());
    focusPromptTextarea();
  };

  return (
    <>
      <SettingsDialog
        open={showSettingsDialog}
        onOpenChange={handleSettingsDialogChange}
        onApiKeySaved={handleApiKeySaved}
        initialTab={settingsInitialTab}
      />

      <div className="relative flex h-full flex-col overflow-hidden bg-transparent">
        <div className="flex-1 overflow-y-auto p-6 pb-0">
          <div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-3">
            <motion.h1
              data-testid="home-title"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.gentle}
              className="macos26-h1 w-full pt-[190px] text-center text-[40px] font-semibold tracking-[-0.032em] text-foreground"
            >
              {t('title')}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springs.gentle, delay: 0.1 }}
              className="w-full"
            >
              <TaskInputBar
                value={prompt}
                onChange={setPrompt}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                placeholder={t('inputPlaceholder')}
                typingPlaceholder={true}
                large={true}
                autoFocus={true}
                onOpenSpeechSettings={handleOpenSpeechSettings}
                onOpenModelSettings={handleOpenModelSettings}
                hideModelWhenNoModel={true}
                attachments={attachedFiles}
                onAddAttachments={handleAddAttachments}
                onRemoveAttachment={handleRemoveAttachment}
                toolbarLeft={
                  <PlusMenu
                    onSkillSelect={handleSkillSelect}
                    onOpenSettings={(tab) => {
                      setSettingsInitialTab(tab);
                      setShowSettingsDialog(true);
                    }}
                    disabled={isLoading}
                    onAttachFiles={handleAttachFiles}
                  />
                }
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...springs.gentle, delay: 0.2 }}
              className="w-full"
            >
              <div className="flex flex-col gap-4 pt-[148px] pb-[120px]">
                <h2 className="text-center text-[22px] font-semibold tracking-[-0.022em] text-foreground/95">
                  {t('examplePrompts')}
                </h2>

                <div className="grid w-full grid-cols-3 gap-4">
                  {useCaseExamples.map((example, index) => (
                    <motion.button
                      key={index}
                      data-testid={`home-example-${index}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleExampleClick(example.prompt)}
                      className="group flex h-[164px] flex-col justify-between rounded-2xl border border-border/80 bg-card/88 px-4 py-3 text-left shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition-colors hover:border-primary/35 hover:bg-card active:border-primary/35"
                    >
                      <div className="flex w-full items-start justify-between">
                        <span className="w-[132px] whitespace-pre-line text-[14px] font-semibold leading-[18px] tracking-[-0.02em] text-foreground">
                          {example.title}
                        </span>
                        <span className="shrink-0 -scale-y-100 rotate-180 translate-y-1 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-active:translate-y-0 group-active:opacity-100">
                          <ArrowUpLeft className="w-4 h-4 text-foreground" weight="regular" />
                        </span>
                      </div>

                      <p className="text-[13px] leading-[16px] tracking-[-0.01em] text-muted-foreground">
                        {example.description}
                      </p>

                      <div className="flex items-center gap-[2px]">
                        {example.icons.map((domain) => (
                          <div
                            key={domain}
                            className="flex shrink-0 items-center rounded-[5.778px] bg-popover/92 p-[3.25px]"
                          >
                            <IntegrationIcon domain={domain} className="w-[22px] h-[22px]" />
                          </div>
                        ))}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[120px] bg-gradient-to-t from-background to-transparent" />
      </div>
    </>
  );
}
