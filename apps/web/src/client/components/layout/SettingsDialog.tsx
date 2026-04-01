import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { getRodjerHelp } from '@/lib/rodjerhelp';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ProviderId, ConnectedProvider } from '@accomplish_ai/agent-core/common';
import { hasAnyReadyProvider, isProviderReady } from '@accomplish_ai/agent-core/common';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';
import { ProviderGrid } from '@/components/settings/ProviderGrid';
import { ProviderSettingsPanel } from '@/components/settings/ProviderSettingsPanel';
import { SpeechSettingsForm } from '@/components/settings/SpeechSettingsForm';
import { SkillsPanel, AddSkillDropdown } from '@/components/settings/skills';
import { AboutTab } from '@/components/settings/AboutTab';
import { IntelligenceTab } from '@/components/settings/IntelligenceTab';
import { VpnTab } from '@/components/settings/VpnTab';
import { DebugSection } from '@/components/settings/DebugSection';
import { ConnectorsPanel } from '@/components/settings/connectors';
import { Key, Lightning, Microphone, Info, Plugs, Brain, ShieldCheck } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import logoImage from '/assets/rodjerhelp-icon.png';

const TABS = [
  { id: 'providers' as const, labelKey: 'tabs.providers', icon: Key },
  { id: 'vpn' as const, labelKey: 'tabs.vpn', icon: ShieldCheck },
  { id: 'intelligence' as const, labelKey: 'tabs.intelligence', icon: Brain },
  { id: 'skills' as const, labelKey: 'tabs.skills', icon: Lightning },
  { id: 'connectors' as const, labelKey: 'tabs.connectors', icon: Plugs },
  { id: 'voice' as const, labelKey: 'tabs.voiceInput', icon: Microphone },
  { id: 'about' as const, labelKey: 'tabs.about', icon: Info },
];

// Первые 4 провайдера в свернутом виде (соответствует PROVIDER_ORDER в ProviderGrid)
const FIRST_FOUR_PROVIDERS: ProviderId[] = ['openai', 'anthropic', 'google', 'bedrock'];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApiKeySaved?: () => void;
  initialProvider?: ProviderId;
  /**
   * Вкладка, которую показывать при открытии диалога ('providers' или 'voice')
   */
  initialTab?: 'providers' | 'vpn' | 'intelligence' | 'voice' | 'skills' | 'connectors' | 'about';
}

export function SettingsDialog({
  open,
  onOpenChange,
  onApiKeySaved,
  initialProvider,
  initialTab = 'providers',
}: SettingsDialogProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [closeWarning, setCloseWarning] = useState(false);
  const [showModelError, setShowModelError] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'providers' | 'vpn' | 'intelligence' | 'voice' | 'skills' | 'connectors' | 'about'
  >(initialTab);
  const [appVersion, setAppVersion] = useState<string>('');
  const [skillsRefreshTrigger, setSkillsRefreshTrigger] = useState(0);

  const {
    settings,
    loading,
    setActiveProvider,
    connectProvider,
    disconnectProvider,
    updateModel,
    refetch,
  } = useProviderSettings();

  // Состояние режима отладки — хранится в appSettings, а не в providerSettings
  const [debugMode, setDebugModeState] = useState(false);
  const accomplish = getRodjerHelp();

  // Перезагружаем настройки и режим отладки при открытии диалога
  useEffect(() => {
    if (!open) return;
    refetch();
    // Загружаем режим отладки из appSettings (правильное хранилище)
    accomplish.getDebugMode().then(setDebugModeState);
    // Загружаем версию приложения
    accomplish.getVersion().then(setAppVersion);
  }, [open, refetch, accomplish]);

  // Сбрасываем/инициализируем состояние при открытии или закрытии диалога
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset on close
      setSelectedProvider(null);
      setGridExpanded(false);
      setCloseWarning(false);
      setShowModelError(false);
    } else {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (open) return;

    const timer = window.setTimeout(() => {
      document.body.style.pointerEvents = '';
      document.documentElement.style.pointerEvents = '';
      document.body.removeAttribute('inert');
      document.documentElement.removeAttribute('inert');
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open]);

  // Автовыбор активного провайдера (или initialProvider) и раскрытие сетки при открытии
  useEffect(() => {
    if (!open || loading) return;

    const providerToSelect = initialProvider || settings?.activeProviderId;
    if (!providerToSelect) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: auto-select on open
    setSelectedProvider(providerToSelect);

    if (!FIRST_FOUR_PROVIDERS.includes(providerToSelect)) {
      setGridExpanded(true);
    }
  }, [open, loading, initialProvider, settings?.activeProviderId]);

  // Обрабатываем попытку закрытия
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen && settings) {
        // Проверяем, пытается ли пользователь закрыть
        if (!hasAnyReadyProvider(settings)) {
          // Нет готового провайдера — показываем предупреждение
          setCloseWarning(true);
          return;
        }
      }
      setCloseWarning(false);
      onOpenChange(newOpen);
    },
    [settings, onOpenChange],
  );

  // Обрабатываем выбор провайдера
  const handleSelectProvider = useCallback(
    async (providerId: ProviderId) => {
      setSelectedProvider(providerId);
      setCloseWarning(false);
      setShowModelError(false);

      // Автоактивация, если выбранный провайдер готов
      const provider = settings?.connectedProviders?.[providerId];
      if (provider && isProviderReady(provider)) {
        await setActiveProvider(providerId);
      }
    },
    [settings?.connectedProviders, setActiveProvider],
  );

  // Обрабатываем подключение провайдера
  const handleConnect = useCallback(
    async (provider: ConnectedProvider) => {
      await connectProvider(provider.providerId, provider);

      // Автоактивация, если новый провайдер готов (подключён + выбрана модель)
      // Это гарантирует, что только что подключённый готовый провайдер станет активным,
      // независимо от того, был ли активен другой провайдер
      if (isProviderReady(provider)) {
        await setActiveProvider(provider.providerId);
        onApiKeySaved?.();
      }
    },
    [connectProvider, setActiveProvider, onApiKeySaved],
  );

  // Обрабатываем отключение провайдера
  const handleDisconnect = useCallback(async () => {
    if (!selectedProvider) return;
    const wasActiveProvider = settings?.activeProviderId === selectedProvider;
    await disconnectProvider(selectedProvider);
    setSelectedProvider(null);

    // Если удалили активного провайдера, автоматически выбираем другого готового
    if (wasActiveProvider && settings?.connectedProviders) {
      const readyProviderId = Object.keys(settings.connectedProviders).find(
        (id) =>
          id !== selectedProvider && isProviderReady(settings.connectedProviders[id as ProviderId]),
      ) as ProviderId | undefined;
      if (readyProviderId) {
        await setActiveProvider(readyProviderId);
      }
    }
  }, [selectedProvider, disconnectProvider, settings, setActiveProvider]);

  // Обрабатываем смену модели
  const handleModelChange = useCallback(
    async (modelId: string) => {
      if (!selectedProvider) return;
      await updateModel(selectedProvider, modelId);

      // Автоактивация, если провайдер теперь готов
      const provider = settings?.connectedProviders[selectedProvider];
      if (provider && isProviderReady({ ...provider, selectedModelId: modelId })) {
        if (!settings?.activeProviderId || settings.activeProviderId !== selectedProvider) {
          await setActiveProvider(selectedProvider);
        }
      }

      setShowModelError(false);
      onApiKeySaved?.();
    },
    [selectedProvider, updateModel, settings, setActiveProvider, onApiKeySaved],
  );

  // Обрабатываем переключение режима отладки — пишет в appSettings (правильное хранилище)
  const handleDebugToggle = useCallback(async () => {
    const newValue = !debugMode;
    await accomplish.setDebugMode(newValue);
    setDebugModeState(newValue);
  }, [debugMode, accomplish]);

  // Обрабатываем кнопку "Готово" (закрытие с валидацией)
  const handleDone = useCallback(() => {
    if (!settings) return;

    // Проверяем, нужна ли модель выбранному провайдеру
    if (selectedProvider) {
      const provider = settings.connectedProviders[selectedProvider];
      if (provider?.connectionStatus === 'connected' && !provider.selectedModelId) {
        setShowModelError(true);
        return;
      }
    }

    // Проверяем, есть ли готовый провайдер
    if (!hasAnyReadyProvider(settings)) {
      setActiveTab('providers'); // Switch to providers tab to show warning
      setCloseWarning(true);
      return;
    }

    // Проверяем, что активный провайдер всё ещё подключён и готов
    // Это покрывает случай, когда активный провайдер был удалён
    if (settings.activeProviderId) {
      const activeProvider = settings.connectedProviders[settings.activeProviderId];
      if (!isProviderReady(activeProvider)) {
        // Активный провайдер больше не готов — ищем готовый, чтобы сделать активным
        const readyProviderId = Object.keys(settings.connectedProviders).find((id) =>
          isProviderReady(settings.connectedProviders[id as ProviderId]),
        ) as ProviderId | undefined;
        if (readyProviderId) {
          setActiveProvider(readyProviderId);
        }
      }
    } else {
      // Активный провайдер не выбран — автоматически выбираем первого готового
      const readyProviderId = Object.keys(settings.connectedProviders).find((id) =>
        isProviderReady(settings.connectedProviders[id as ProviderId]),
      ) as ProviderId | undefined;
      if (readyProviderId) {
        setActiveProvider(readyProviderId);
      }
    }

    onOpenChange(false);
  }, [settings, selectedProvider, onOpenChange, setActiveProvider]);

  // Принудительное закрытие (скрыть предупреждение)
  const handleForceClose = useCallback(() => {
    setCloseWarning(false);
    onOpenChange(false);
  }, [onOpenChange]);

  if (loading || !settings) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-4xl w-full h-[80vh] flex flex-col overflow-hidden p-0"
          data-testid="settings-dialog"
          onOpenAutoFocus={(e: Event) => e.preventDefault()}
          onCloseAutoFocus={(e: Event) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-[70vh] w-full max-w-5xl overflow-hidden border border-border/80 bg-[rgba(9,14,26,0.94)] p-0 shadow-[0_36px_96px_rgba(0,0,0,0.46)]"
        data-testid="settings-dialog"
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
        onCloseAutoFocus={(e: Event) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        {/* Навигация в левой панели */}
        <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-border/80 bg-[rgba(8,12,22,0.82)] p-3">
          <div className="mb-1 px-3 py-2">
            <div className="flex items-center gap-2">
              <img src={logoImage} alt={tCommon('app.name')} className="h-8 w-8 rounded-xl" />
              <div className="flex flex-col leading-none">
                <span className="text-sm font-semibold">{tCommon('app.name')}</span>
                <span className="text-[11px] text-muted-foreground">{tCommon('app.byline')}</span>
              </div>
            </div>
          </div>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-accent text-foreground shadow-[0_12px_28px_rgba(0,0,0,0.28)]'
                  : 'text-muted-foreground hover:bg-accent/80 hover:text-foreground',
              )}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {t(tab.labelKey)}
            </button>
          ))}
        </nav>

        {/* Правая область контента */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Заголовок контента с названием и действиями */}
          <div className="flex items-center justify-between border-b border-border/70 px-6 pb-3 pt-5">
            <h3 className="text-sm font-semibold text-foreground">
              {TABS.find((tab) => tab.id === activeTab)?.labelKey &&
                t(TABS.find((tab) => tab.id === activeTab)!.labelKey)}
            </h3>
          </div>

          {/* Прокручиваемый контент */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="space-y-6">
              {/* Предупреждение о закрытии */}
              <AnimatePresence>
                {closeWarning && (
                  <motion.div
                    className="mb-6 rounded-lg border border-warning/35 bg-warning/10 p-4"
                    variants={settingsVariants.fadeSlide}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={settingsTransitions.enter}
                  >
                    <div className="flex items-start gap-3">
                      <svg
                        className="h-5 w-5 text-warning flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-warning">
                          {t('warnings.noProviderReady')}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('warnings.noProviderReadyDescription')}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={handleForceClose}
                            className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/80"
                          >
                            {t('warnings.closeAnyway')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Вкладка провайдеров */}
              {activeTab === 'providers' && (
                <div className="space-y-6">
                  <section>
                    <ProviderGrid
                      settings={settings}
                      selectedProvider={selectedProvider}
                      onSelectProvider={handleSelectProvider}
                      expanded={gridExpanded}
                      onToggleExpanded={() => setGridExpanded(!gridExpanded)}
                    />
                  </section>

                  <AnimatePresence>
                    {selectedProvider && (
                      <motion.section
                        variants={settingsVariants.slideDown}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={settingsTransitions.enter}
                      >
                        <ProviderSettingsPanel
                          key={selectedProvider}
                          providerId={selectedProvider}
                          connectedProvider={settings?.connectedProviders?.[selectedProvider]}
                          onConnect={handleConnect}
                          onDisconnect={handleDisconnect}
                          onModelChange={handleModelChange}
                          showModelError={showModelError}
                        />
                      </motion.section>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {selectedProvider && (
                      <motion.section
                        variants={settingsVariants.slideDown}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ ...settingsTransitions.enter, delay: 0.05 }}
                      >
                        <DebugSection debugMode={debugMode} onDebugToggle={handleDebugToggle} />
                      </motion.section>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {activeTab === 'vpn' && <VpnTab />}
              {activeTab === 'intelligence' && <IntelligenceTab />}

              {/* Вкладка навыков */}
              {activeTab === 'skills' && (
                <div className="space-y-4">
                  <SkillsPanel refreshTrigger={skillsRefreshTrigger} />
                </div>
              )}

              {/* Вкладка коннекторов */}
              {activeTab === 'connectors' && (
                <div className="space-y-6">
                  <ConnectorsPanel />
                </div>
              )}

              {/* Вкладка голосового ввода */}
              {activeTab === 'voice' && (
                <div className="space-y-6">
                  <SpeechSettingsForm />
                </div>
              )}

              {/* Вкладка о приложении */}
              {activeTab === 'about' && <AboutTab appVersion={appVersion} />}

              {/* Подвал: добавить (только навыки) + Готово */}
              <div className="mt-4 flex items-center justify-between">
                <div>
                  {activeTab === 'skills' && (
                    <AddSkillDropdown
                      onSkillAdded={() => setSkillsRefreshTrigger((prev) => prev + 1)}
                      onClose={() => onOpenChange(false)}
                    />
                  )}
                </div>
                <button
                  onClick={handleDone}
                  className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-[0_14px_32px_rgba(32,112,255,0.34)] hover:bg-primary/90"
                  data-testid="settings-done-button"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {t('buttons.done')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
