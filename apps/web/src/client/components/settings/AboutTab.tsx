import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getRodjerHelp, type AppUpdateStatus } from '@/lib/rodjerhelp';

interface AboutTabProps {
  appVersion: string;
}

const INITIAL_UPDATE_STATUS: AppUpdateStatus = { status: 'idle' };

export function AboutTab({ appVersion }: AboutTabProps) {
  const { t } = useTranslation('settings');
  const accomplish = getRodjerHelp();
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>(INITIAL_UPDATE_STATUS);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let mounted = true;

    accomplish
      .getUpdateStatus()
      .then((status) => {
        if (mounted) {
          setUpdateStatus(status);
        }
      })
      .catch(() => {
        // ignore initial update status errors
      });

    const unsubscribe = accomplish.onUpdateStatus?.((status) => {
      if (mounted) {
        setUpdateStatus(status);
        if (status.status !== 'checking' && status.status !== 'downloading') {
          setChecking(false);
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [accomplish]);

  const updateStatusText = useMemo(() => {
    switch (updateStatus.status) {
      case 'checking':
        return t('about.updates.checking');
      case 'available':
        return t('about.updates.available', { version: updateStatus.version ?? '' });
      case 'downloading':
        return t('about.updates.downloading', {
          progress: Math.round(updateStatus.progress ?? 0),
        });
      case 'downloaded':
        return t('about.updates.downloaded', { version: updateStatus.version ?? '' });
      case 'not-available':
        return updateStatus.message || t('about.updates.notAvailable');
      case 'error':
        return updateStatus.message || t('about.updates.error');
      default:
        return t('about.updates.idle');
    }
  }, [updateStatus, t]);

  const handleCheckUpdates = async () => {
    try {
      setChecking(true);
      const status = await accomplish.checkForUpdates();
      setUpdateStatus(status);
    } finally {
      setChecking(false);
    }
  };

  const handleInstallUpdate = async () => {
    await accomplish.installDownloadedUpdate();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">Контакты</div>
            <div className="space-y-1">
              <a
                href="https://t.me/RodjerYan"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Telegram: @RodjerYan
              </a>
              <div>
                <a href="mailto:rodjeryan@gmail.com" className="text-primary hover:underline">
                  Email: rodjeryan@gmail.com
                </a>
              </div>
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('about.haveQuestion')}</div>
            <a href="mailto:rodjeryan@gmail.com" className="text-primary hover:underline">
              rodjeryan@gmail.com
            </a>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('about.versionLabel')}</div>
            <div className="font-medium">{appVersion || t('about.loading')}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('about.updates.label')}</div>
            <div className="space-y-3 pt-1">
              <div className="text-sm font-medium">{updateStatusText}</div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handleCheckUpdates} disabled={checking}>
                  {checking ? t('about.updates.checkingButton') : t('about.updates.checkButton')}
                </Button>
                {updateStatus.status === 'downloaded' ? (
                  <Button type="button" onClick={handleInstallUpdate}>
                    {t('about.updates.installButton')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          {t('about.allRightsReserved')}
        </div>
      </div>
    </div>
  );
}
