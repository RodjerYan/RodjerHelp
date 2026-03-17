import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LearningInsight, LearningSettings } from '@accomplish_ai/agent-core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getRodjerHelp } from '@/lib/rodjerhelp';

const FALLBACK_SETTINGS: LearningSettings = {
  selfLearningEnabled: true,
  autoApplyLearning: true,
};

function Toggle({
  enabled,
  onClick,
  disabled = false,
  testId,
}: {
  enabled: boolean;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
        enabled ? 'bg-primary' : 'bg-muted'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function IntelligenceTab() {
  const { t } = useTranslation('settings');
  const accomplish = getRodjerHelp();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<LearningSettings>(FALLBACK_SETTINGS);
  const [insights, setInsights] = useState<LearningInsight[]>([]);

  const loadLearningState = useCallback(async () => {
    const [learningSettings, learningInsights] = await Promise.all([
      accomplish.getLearningSettings?.() ?? Promise.resolve(FALLBACK_SETTINGS),
      accomplish.getLearningInsights?.() ?? Promise.resolve([]),
    ]);

    setSettings(learningSettings);
    setInsights(learningInsights);
  }, [accomplish]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        await loadLearningState();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [loadLearningState]);

  const handleToggleSelfLearning = useCallback(async () => {
    if (!accomplish.setSelfLearningEnabled) {
      return;
    }

    const nextValue = !settings.selfLearningEnabled;
    setBusy(true);
    try {
      await accomplish.setSelfLearningEnabled(nextValue);
      setSettings((current) => ({ ...current, selfLearningEnabled: nextValue }));
    } finally {
      setBusy(false);
    }
  }, [accomplish, settings.selfLearningEnabled]);

  const handleToggleAutoApply = useCallback(async () => {
    if (!accomplish.setAutoApplyLearning) {
      return;
    }

    const nextValue = !settings.autoApplyLearning;
    setBusy(true);
    try {
      await accomplish.setAutoApplyLearning(nextValue);
      setSettings((current) => ({ ...current, autoApplyLearning: nextValue }));
    } finally {
      setBusy(false);
    }
  }, [accomplish, settings.autoApplyLearning]);

  const handleDeleteInsight = useCallback(
    async (insightId: string) => {
      if (!accomplish.deleteLearningInsight) {
        return;
      }

      setBusy(true);
      try {
        await accomplish.deleteLearningInsight(insightId);
        setInsights((current) => current.filter((insight) => insight.id !== insightId));
      } finally {
        setBusy(false);
      }
    },
    [accomplish],
  );

  const handleClearInsights = useCallback(async () => {
    if (!accomplish.clearLearningInsights) {
      return;
    }

    setBusy(true);
    try {
      await accomplish.clearLearningInsights();
      setInsights([]);
    } finally {
      setBusy(false);
    }
  }, [accomplish]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-lg border border-border bg-card p-0 shadow-none">
        <CardHeader className="gap-3 border-b border-border pb-5">
          <CardTitle>{t('intelligence.title')}</CardTitle>
          <CardDescription>{t('intelligence.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <div className="font-medium text-foreground">{t('intelligence.selfLearning')}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('intelligence.selfLearningDescription')}
              </p>
            </div>
            <Toggle
              enabled={settings.selfLearningEnabled}
              onClick={handleToggleSelfLearning}
              disabled={busy}
              testId="settings-self-learning-toggle"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <div className="font-medium text-foreground">{t('intelligence.autoApply')}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('intelligence.autoApplyDescription')}
              </p>
            </div>
            <Toggle
              enabled={settings.autoApplyLearning}
              onClick={handleToggleAutoApply}
              disabled={busy || !settings.selfLearningEnabled}
              testId="settings-auto-apply-learning-toggle"
            />
          </div>

          <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            {t('intelligence.memorySummary', { count: insights.length })}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg border border-border bg-card p-0 shadow-none">
        <CardHeader className="gap-3 border-b border-border pb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>{t('intelligence.learnedInsights')}</CardTitle>
              <CardDescription>{t('intelligence.learnedInsightsDescription')}</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleClearInsights}
              disabled={busy || insights.length === 0}
            >
              {t('intelligence.clearMemory')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-5">
          {insights.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              {t('intelligence.empty')}
            </div>
          ) : (
            insights.map((insight) => (
              <div
                key={insight.id}
                className="rounded-lg border border-border bg-background/60 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="font-medium text-foreground">{insight.title}</div>
                    <p className="text-sm text-muted-foreground">{insight.content}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        {t(`intelligence.categories.${insight.category}`)}
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        {insight.scopeLabel
                          ? t('intelligence.scopeLabel', { scope: insight.scopeLabel })
                          : t('intelligence.globalScope')}
                      </span>
                      <span>
                        {t('intelligence.repeatCount', { count: insight.occurrenceCount })}
                      </span>
                      <span>
                        {t('intelligence.confidence', {
                          value: Math.round(insight.confidence * 100),
                        })}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDeleteInsight(insight.id)}
                    disabled={busy}
                  >
                    {t('intelligence.deleteInsight')}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
